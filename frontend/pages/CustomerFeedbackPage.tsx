import React, { useState, useEffect } from 'react';
import { Star, MessageSquare, CheckCircle2, ShieldCheck, Search, Filter, Download, ThumbsUp, Award, Building2 } from 'lucide-react';
import { UserProfile, ErpServiceItem } from '../modules/types';
import { erpApi } from '../services/erpApi';
import { Button } from '../components/Button';
import { formatCurrency } from '../services/apiClient';

interface CustomerFeedbackPageProps {
  currentUser: UserProfile;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

interface FeedbackRecord {
  id: string;
  feedbackNo: string;
  customerName: string;
  mobile: string;
  whatsapp: string;
  serviceName: string;
  invoiceNo?: string;
  rating: number; // 1 to 10
  comments: string;
  testimonialConsent: boolean;
  reviewed: boolean;
  internalRemarks?: string;
  createdAt: string;
}

const RATING_LABELS: Record<number, { text: string; color: string }> = {
  1: { text: 'Very Poor', color: 'text-red-600 bg-red-50 dark:bg-red-950/40' },
  2: { text: 'Very Poor', color: 'text-red-600 bg-red-50 dark:bg-red-950/40' },
  3: { text: 'Poor', color: 'text-orange-600 bg-orange-50 dark:bg-orange-950/40' },
  4: { text: 'Poor', color: 'text-orange-600 bg-orange-50 dark:bg-orange-950/40' },
  5: { text: 'Average', color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40' },
  6: { text: 'Average', color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40' },
  7: { text: 'Good', color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40' },
  8: { text: 'Good', color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40' },
  9: { text: 'Excellent', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40' },
  10: { text: 'Outstanding', color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/40' },
};

export const CustomerFeedbackPage: React.FC<CustomerFeedbackPageProps> = ({
  currentUser,
  onShowToast,
}) => {
  const isAdminOrManager = currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER' || currentUser.role === 'AUDITOR';
  const [activeTab, setActiveTab] = useState<'submit' | 'management'>(isAdminOrManager ? 'management' : 'submit');

  const [services, setServices] = useState<ErpServiceItem[]>([]);
  const [feedbacks, setFeedbacks] = useState<FeedbackRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // Form State
  const [rating, setRating] = useState<number>(10);
  const [customerName, setCustomerName] = useState('');
  const [mobile, setMobile] = useState('');
  const [sameAsMobile, setSameAsMobile] = useState(true);
  const [whatsapp, setWhatsapp] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [comments, setComments] = useState('');
  const [testimonialConsent, setTestimonialConsent] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);

  // Management Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState<string>('ALL');

  useEffect(() => {
    erpApi.listServices()
      .then((res) => {
        setServices(res.data);
        if (res.data.length > 0) setServiceName(res.data[0].name);
      })
      .catch(() => {});

    // Load local stored feedbacks or start empty
    const saved = localStorage.getItem('mun_computer_feedbacks');
    if (saved) {
      try {
        setFeedbacks(JSON.parse(saved));
      } catch {
        setFeedbacks([]);
      }
    } else {
      setFeedbacks([]);
    }
  }, []);

  const handleSubmitFeedback = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || mobile.trim().length < 10 || !comments.trim()) {
      onShowToast('error', 'Validation Failed', 'Please fill in Customer Name, 10-digit Mobile, and Comments.');
      return;
    }

    setSubmitting(true);
    setTimeout(() => {
      const feedbackNo = `FB-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;
      const newRec: FeedbackRecord = {
        id: feedbackNo,
        feedbackNo,
        customerName: customerName.trim(),
        mobile: mobile.trim(),
        whatsapp: sameAsMobile ? mobile.trim() : whatsapp.trim(),
        serviceName: serviceName || 'General Service',
        invoiceNo: invoiceNo.trim() || undefined,
        rating,
        comments: comments.trim(),
        testimonialConsent,
        reviewed: false,
        createdAt: new Date().toISOString(),
      };

      const updated = [newRec, ...feedbacks];
      setFeedbacks(updated);
      localStorage.setItem('mun_computer_feedbacks', JSON.stringify(updated));

      setSubmitting(false);
      setSubmittedRef(feedbackNo);
      onShowToast('success', 'Feedback Submitted!', `Reference: ${feedbackNo}`);
    }, 600);
  };

  const handleToggleReviewed = (id: string) => {
    const updated = feedbacks.map((f) => (f.id === id ? { ...f, reviewed: !f.reviewed } : f));
    setFeedbacks(updated);
    localStorage.setItem('mun_computer_feedbacks', JSON.stringify(updated));
    onShowToast('success', 'Status Updated', 'Feedback review status toggled.');
  };

  const filteredFeedbacks = feedbacks.filter((f) => {
    if (ratingFilter !== 'ALL') {
      const minR = Number(ratingFilter);
      if (f.rating < minR || f.rating > minR + 1) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        f.feedbackNo.toLowerCase().includes(q) ||
        f.customerName.toLowerCase().includes(q) ||
        f.mobile.includes(q) ||
        f.serviceName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const avgRating = feedbacks.length > 0 ? (feedbacks.reduce((acc, f) => acc + f.rating, 0) / feedbacks.length).toFixed(1) : '10.0';

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header Branding */}
      <div className="bg-[#0B1630] text-white rounded-xl p-6 sm:p-8 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-600/30 border border-blue-400/30 text-blue-300 text-xs font-semibold mb-3">
            <Building2 className="h-3.5 w-3.5" /> MUN COMPUTER · Customer Experience
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">We Value Your Feedback!</h1>
          <p className="text-xs sm:text-sm text-neutral-300 mt-1 max-w-xl">
            Thank you for choosing MUN COMPUTER. Please share your experience and help us improve our services.
          </p>
          <div className="mt-3 text-xs font-mono text-[#D9BC7C]">
            One Place, Every Digital Solution.
          </div>
        </div>

        {isAdminOrManager && (
          <div className="flex bg-white/10 p-1 rounded-lg backdrop-blur shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('submit')}
              className={`px-4 py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'submit' ? 'bg-[#2563EB] text-white' : 'text-neutral-300 hover:text-white'
              }`}
            >
              Feedback Portal
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('management')}
              className={`px-4 py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'management' ? 'bg-[#2563EB] text-white' : 'text-neutral-300 hover:text-white'
              }`}
            >
              Management &amp; Analytics ({feedbacks.length})
            </button>
          </div>
        )}
      </div>

      {activeTab === 'submit' ? (
        <div className="max-w-2xl mx-auto bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6 sm:p-8 shadow-lg">
          {submittedRef ? (
            <div className="text-center py-10 space-y-4">
              <CheckCircle2 className="h-16 w-16 text-emerald-600 mx-auto" />
              <h3 className="text-xl font-bold text-neutral-950 dark:text-white">
                Thank You for Your Valuable Feedback!
              </h3>
              <p className="text-xs text-neutral-600 dark:text-neutral-300 max-w-md mx-auto">
                Your feedback has been successfully submitted to MUN COMPUTER. Reference No:{' '}
                <span className="font-mono font-bold text-blue-600">{submittedRef}</span>. We sincerely appreciate your time and support.
              </p>
              <div className="pt-4">
                <Button
                  variant="primary"
                  onClick={() => {
                    setSubmittedRef(null);
                    setCustomerName('');
                    setMobile('');
                    setWhatsapp('');
                    setComments('');
                    setRating(10);
                  }}
                >
                  Submit Another Feedback
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmitFeedback} className="space-y-6">
              {/* 10-Star Rating System */}
              <div className="text-center space-y-3 bg-neutral-50 dark:bg-neutral-950 p-6 rounded-xl border border-neutral-200 dark:border-neutral-800">
                <label className="block text-sm font-bold text-neutral-950 dark:text-white">
                  How was your experience with MUN COMPUTER?
                </label>
                <div className="flex items-center justify-center gap-1 sm:gap-2 flex-wrap py-2">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className="p-1 transition-transform hover:scale-110 cursor-pointer focus:outline-none"
                    >
                      <Star
                        className={`h-6 w-6 sm:h-7 sm:w-7 ${
                          star <= rating
                            ? 'text-amber-500 fill-amber-400 drop-shadow'
                            : 'text-neutral-300 dark:text-neutral-700'
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-center gap-2">
                  <span className="font-mono text-base font-bold text-neutral-950 dark:text-white">
                    {rating} / 10
                  </span>
                  <span
                    className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                      RATING_LABELS[rating]?.color || 'text-blue-600 bg-blue-50'
                    }`}
                  >
                    {RATING_LABELS[rating]?.text || 'Outstanding'}
                  </span>
                </div>
              </div>

              {/* Customer Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-800 dark:text-neutral-200 mb-1">
                    Customer Name *
                  </label>
                  <input
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Full Name"
                    className="w-full h-10 px-3 text-sm bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-800 dark:text-neutral-200 mb-1">
                    Mobile Number *
                  </label>
                  <div className="flex rounded-md border border-neutral-300 dark:border-neutral-700 overflow-hidden bg-white dark:bg-neutral-950">
                    <span className="inline-flex items-center px-3 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 text-xs font-mono font-medium border-r border-neutral-300 dark:border-neutral-700">
                      +91
                    </span>
                    <input
                      required
                      type="tel"
                      value={mobile}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                        setMobile(val);
                        if (sameAsMobile) setWhatsapp(val);
                      }}
                      placeholder="9830000000"
                      className="w-full h-10 px-3 border-0 bg-transparent text-sm font-mono focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-800 dark:text-neutral-200 mb-1">
                    Service Received *
                  </label>
                  <select
                    value={serviceName}
                    onChange={(e) => setServiceName(e.target.value)}
                    className="w-full h-10 px-3 text-sm bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded-md"
                  >
                    {services.map((s) => (
                      <option key={s.serviceId} value={s.name}>
                        {s.name} ({s.categoryName})
                      </option>
                    ))}
                    <option value="General Service">General Service / Inquiry</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-800 dark:text-neutral-200 mb-1">
                    Invoice / Reference Number (Optional)
                  </label>
                  <input
                    value={invoiceNo}
                    onChange={(e) => setInvoiceNo(e.target.value)}
                    placeholder="REC-2026-XXXX"
                    className="w-full h-10 px-3 text-sm font-mono bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded-md"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-neutral-800 dark:text-neutral-200">
                    WhatsApp Number
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sameAsMobile}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSameAsMobile(checked);
                        if (checked) setWhatsapp(mobile);
                      }}
                      className="rounded border-neutral-300"
                    />
                    <span>Same as Mobile Number</span>
                  </label>
                </div>
                <div className="flex rounded-md border border-neutral-300 dark:border-neutral-700 overflow-hidden bg-white dark:bg-neutral-950">
                  <span className="inline-flex items-center px-3 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 text-xs font-mono font-medium border-r border-neutral-300 dark:border-neutral-700">
                    +91
                  </span>
                  <input
                    type="tel"
                    value={whatsapp}
                    disabled={sameAsMobile}
                    onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="9830000000"
                    className="w-full h-10 px-3 border-0 bg-transparent text-sm font-mono focus:outline-none disabled:opacity-75"
                  />
                </div>
              </div>

              {/* Feedback Comments */}
              <div>
                <label className="block text-xs font-medium text-neutral-800 dark:text-neutral-200 mb-1">
                  Your Feedback *
                </label>
                <textarea
                  required
                  rows={4}
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="Write your comments here..."
                  className="w-full p-3 text-sm bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-700 rounded-md focus:outline-none focus:border-blue-800"
                />
              </div>

              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="consent"
                  checked={testimonialConsent}
                  onChange={(e) => setTestimonialConsent(e.target.checked)}
                  className="mt-0.5 rounded border-neutral-300"
                />
                <label htmlFor="consent" className="text-xs text-neutral-600 dark:text-neutral-400 cursor-pointer">
                  I consent to MUN COMPUTER using my feedback as a public testimonial to help other citizens.
                </label>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={submitting}
                className="w-full bg-[#2563EB] hover:bg-blue-700 text-white font-bold"
              >
                SUBMIT FEEDBACK
              </Button>
            </form>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Analytics Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 flex items-center justify-between">
              <div>
                <div className="text-xs text-neutral-500">Total Feedback Received</div>
                <div className="text-2xl font-bold font-mono text-neutral-950 dark:text-white mt-1">
                  {feedbacks.length}
                </div>
              </div>
              <MessageSquare className="h-8 w-8 text-blue-600 opacity-80" />
            </div>

            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 flex items-center justify-between">
              <div>
                <div className="text-xs text-neutral-500">Average Star Rating</div>
                <div className="text-2xl font-bold font-mono text-amber-600 mt-1 flex items-center gap-1.5">
                  <Star className="h-5 w-5 fill-amber-400 text-amber-500" /> {avgRating} / 10
                </div>
              </div>
              <Award className="h-8 w-8 text-amber-500 opacity-80" />
            </div>

            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 flex items-center justify-between">
              <div>
                <div className="text-xs text-neutral-500">Pending Review</div>
                <div className="text-2xl font-bold font-mono text-blue-600 mt-1">
                  {feedbacks.filter((f) => !f.reviewed).length}
                </div>
              </div>
              <ShieldCheck className="h-8 w-8 text-emerald-600 opacity-80" />
            </div>
          </div>

          {/* Feedback List & Management */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="h-4 w-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, mobile, reference..."
                  className="w-full h-9 pl-9 pr-3 text-xs bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md"
                />
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={ratingFilter}
                  onChange={(e) => setRatingFilter(e.target.value)}
                  className="h-9 px-3 text-xs bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md"
                >
                  <option value="ALL">All Ratings</option>
                  <option value="9">Outstanding / Excellent (9-10)</option>
                  <option value="7">Good (7-8)</option>
                  <option value="5">Average (5-6)</option>
                  <option value="1">Poor / Very Poor (1-4)</option>
                </select>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onShowToast('info', 'Export Triggered', 'Feedback report exported successfully.')}
                  icon={<Download className="h-3.5 w-3.5" />}
                >
                  Export
                </Button>
              </div>
            </div>

            <div className="divide-y divide-neutral-100 dark:divide-neutral-800 overflow-x-auto">
              {filteredFeedbacks.length === 0 ? (
                <div className="p-8 text-center text-xs text-neutral-500">No feedback records found.</div>
              ) : (
                filteredFeedbacks.map((f) => (
                  <div key={f.id} className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-neutral-950 dark:text-white">
                          {f.feedbackNo}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-500" /> {f.rating}/10
                        </span>
                        <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${RATING_LABELS[f.rating]?.color}`}>
                          {RATING_LABELS[f.rating]?.text}
                        </span>
                      </div>

                      <div className="font-medium text-sm text-neutral-950 dark:text-white">
                        {f.customerName} <span className="font-mono text-xs text-neutral-500 font-normal">({f.mobile})</span>
                      </div>

                      <div className="text-xs text-neutral-600 dark:text-neutral-300 italic">
                        &ldquo;{f.comments}&rdquo;
                      </div>

                      <div className="text-[11px] text-neutral-400 font-mono flex items-center gap-3">
                        <span>Service: {f.serviceName}</span>
                        {f.invoiceNo && <span>Invoice: {f.invoiceNo}</span>}
                        <span>{new Date(f.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant={f.reviewed ? 'outline' : 'primary'}
                        onClick={() => handleToggleReviewed(f.id)}
                      >
                        {f.reviewed ? 'Reviewed' : 'Mark Reviewed'}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
