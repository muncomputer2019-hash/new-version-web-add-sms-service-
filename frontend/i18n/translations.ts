import React, { createContext, useContext } from 'react';

export type LanguageCode = 'en' | 'bn' | 'hi';

export const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  en: 'English',
  bn: 'বাংলা',
  hi: 'हिन्दी',
};

export interface TranslationDictionary {
  appTagline: string;
  workspace: string;
  quickAdd: string;
  searchPlaceholder: string;
  notifications: string;
  markAllRead: string;
  signOut: string;
  lightMode: string;
  darkMode: string;
  saveChanges: string;
  cancel: string;
  confirm: string;
  refreshView: string;
  newApplication: string;
  addCustomer: string;
  newPayment: string;
  createReceipt: string;
  addExpense: string;
  quickActions: string;
  operationsDashboard: string;
  today: string;
  thisWeek: string;
  thisMonth: string;
  customizableWidgets: string;
  masterSettingsTitle: string;
  masterSettingsSubtitle: string;
  searchSettingsPlaceholder: string;
  managerProposalBanner: string;
  navGroups: Record<string, string>;
  navLabels: Record<string, string>;
  dashboardWidgets: Record<string, string>;
  reportsTitle: string;
  exportPdf: string;
  exportCsv: string;
  exportExcel: string;
}

export const TRANSLATIONS: Record<LanguageCode, TranslationDictionary> = {
  en: {
    appTagline: 'Business Management Suite',
    workspace: 'Workspace',
    quickAdd: 'Quick Add',
    searchPlaceholder: 'Search customers, applications, modules...',
    notifications: 'Notifications',
    markAllRead: 'Mark all read',
    signOut: 'Sign Out',
    lightMode: 'Light',
    darkMode: 'Dark',
    saveChanges: 'Save Changes',
    cancel: 'Cancel',
    confirm: 'Confirm',
    refreshView: 'Refresh View',
    newApplication: 'New Application',
    addCustomer: 'Add Customer',
    newPayment: 'New Payment',
    createReceipt: 'Create Receipt',
    addExpense: 'Add Expense',
    quickActions: 'Quick Actions',
    operationsDashboard: 'Operations Dashboard',
    today: 'Today',
    thisWeek: 'This Week',
    thisMonth: 'This Month',
    customizableWidgets: 'Customize Widgets',
    masterSettingsTitle: 'Master Settings & Global Configuration',
    masterSettingsSubtitle: 'Centralized business, financial-year, localization, security, backup, and operational governance for MUN COMPUTER.',
    searchSettingsPlaceholder: 'Search settings modules...',
    managerProposalBanner: 'Manager Access Mode: Direct Master Settings changes require Admin approval. You can submit change proposals for permitted modules.',
    navGroups: {
      Overview: 'Overview',
      'CSC Digital Center': 'CSC Digital Center',
      'Citizen Portal': 'Citizen Portal',
      Operations: 'Operations',
      Finance: 'Finance',
      'Catalog & Team': 'Catalog & Team',
      'Reports & BI': 'Reports & BI',
      'Security & Access': 'Security & Access',
      'Quality & Release': 'Quality & Release',
      System: 'System',
    },
    navLabels: {
      dashboard: 'Dashboard',
      customers: 'Customers',
      services: 'Services',
      applications: 'Applications',
      transactions: 'Transactions',
      cashbook: 'Cashbook',
      expenses: 'Expenses',
      income: 'Income',
      'finance-hub': 'Financial Engine (01–94)',
      'chart-of-accounts': 'CoA, Vouchers & GL',
      'banking-csp': 'Banking, BRS & PNB CSP',
      employees: 'Employees & Payroll',
      products: 'Products & POS',
      inventory: 'Inventory & COGS',
      users: 'User Management',
      'add-user': 'Add New User',
      roles: 'Role Management',
      permissions: 'Permission Matrix',
      'registration-requests': 'Registration Requests',
      approvals: 'Approval Management',
      'login-history': 'Login History',
      'security-logs': 'Security & Audit Logs',
      sessions: 'Session Management',
      'security-dashboard': 'Security & Threat Center',
      'device-monitoring': 'Devices & OTP Logs',
      'backup-recovery': 'Backup & Restore DR',
      'data-recovery': 'Data Recovery Archive',
      'user-profile': 'My Profile',
      reports: 'Reporting Dashboard',
      'reports-catalog': 'All Reports Center',
      'reports-analytics': 'Business Analytics',
      'reports-builder': 'Custom Report Builder',
      'reports-scheduler': 'Scheduled Reports',
      'reports-archive': 'Archive & Report Audit',
      notifications: 'Notifications',
      'master-settings': 'Master Settings',
      'qa-dashboard': 'QA Executive Dashboard',
      'qa-workbench': 'Test Execution Workbench',
      'qa-bugs': 'Bugs, Security & Perf',
      'qa-release': 'UAT, Reconciliation & Release',
      'csc-services': 'CSC Services & Rates (550+)',
      'csc-pvc': 'PVC Card Printing Desk',
      'csc-orders': 'CSC Orders & Doc Vault',
      'csc-grievances': 'Grievance & RTI Tracker',
      'csc-schemes': 'PM-JAY, MMSBY, NPCI & Cyber 1930',
      'csc-operators': 'Operator Control (11 Perms)',
      'customer-portal': 'Citizen Self-Service Portal',
      settings: 'System Architecture',
    },
    dashboardWidgets: {
      'Total Customers': 'Total Customers',
      'Total Applications': 'Total Applications',
      'Today Collection': "Today's Collection",
      'Pending Payments': 'Pending Payments',
      'Total Expenses': 'Total Expenses',
      'Today Profit': "Today's Profit",
      'Recent Activities': 'Recent Activities',
      'Pending Approvals': 'Pending Approvals',
      'Service-wise Reports': 'Service-wise Reports',
      'Monthly Collection': 'Monthly Collection',
    },
    reportsTitle: 'Reports & Export Center',
    exportPdf: 'Print / Save PDF',
    exportCsv: 'Export CSV',
    exportExcel: 'Export Excel (.xls)',
  },
  bn: {
    appTagline: 'ব্যবসা পরিচালনা সিস্টেম',
    workspace: 'ওয়ার্কস্পেস',
    quickAdd: 'দ্রুত যোগ করুন',
    searchPlaceholder: 'গ্রাহক, আবেদন বা মডিউল খুঁজুন...',
    notifications: 'বিজ্ঞপ্তি',
    markAllRead: 'সব পঠিত চিহ্নিত করুন',
    signOut: 'লগ আউট',
    lightMode: 'লাইট',
    darkMode: 'ডার্ক',
    saveChanges: 'সংরক্ষণ করুন',
    cancel: 'বাতিল',
    confirm: 'নিশ্চিত করুন',
    refreshView: 'তথ্য রিফ্রেশ করুন',
    newApplication: 'নতুন আবেদন',
    addCustomer: 'গ্রাহক যোগ করুন',
    newPayment: 'নতুন পেমেন্ট',
    createReceipt: 'রসিদ তৈরি করুন',
    addExpense: 'খরচ যোগ করুন',
    quickActions: 'দ্রুত পদক্ষেপ',
    operationsDashboard: 'অপারেশনস ড্যাশবোর্ড',
    today: 'আজ',
    thisWeek: 'এই সপ্তাহ',
    thisMonth: 'এই মাস',
    customizableWidgets: 'উইজেট কাস্টমাইজ',
    masterSettingsTitle: 'মাস্টার সেটিংস ও গ্লোবাল কনফিগারেশন',
    masterSettingsSubtitle: 'MUN COMPUTER-এর কোম্পানি প্রোফাইল, সার্ভিস রেট, ভাষা, নিরাপত্তা, ব্যাকআপ এবং অনুমোদন পরিচালনা।',
    searchSettingsPlaceholder: 'সেটিংস মডিউল খুঁজুন...',
    managerProposalBanner: 'ম্যানেজার অ্যাক্সেস মোড: সরাসরি পরিবর্তনের জন্য অ্যাডমিন অনুমোদন প্রয়োজন। অনুমোদিত মডিউলের জন্য প্রস্তাব জমা দিন।',
    navGroups: {
      Overview: 'সংক্ষিপ্ত বিবরণ',
      'CSC Digital Center': 'সিএসসি ডিজিটাল কেন্দ্র',
      'Citizen Portal': 'নাগরিক পোর্টাল',
      Operations: 'কার্যক্রম',
      Finance: 'আর্থিক হিসাব',
      'Catalog & Team': 'তালিকা ও দল',
      'Reports & BI': 'রিপোর্ট ও বিশ্লেষণ',
      'Security & Access': 'নিরাপত্তা ও অ্যাক্সেস',
      'Quality & Release': 'গুণমান ও রিলিজ (QA)',
      System: 'সিস্টেম',
    },
    navLabels: {
      dashboard: 'ড্যাশবোর্ড',
      customers: 'গ্রাহক তালিকা',
      services: 'পরিষেবা',
      applications: 'আবেদনসমূহ',
      transactions: 'লেনদেন',
      cashbook: 'ক্যাশবুক',
      expenses: 'খরচ',
      income: 'আয়',
      'finance-hub': 'আর্থিক ইঞ্জিন (০১–৯৪)',
      'chart-of-accounts': 'অ্যাকাউন্ট চার্ট ও ভাউচার',
      'banking-csp': 'ব্যাংকিং, বিআরএস ও PNB CSP',
      employees: 'কর্মচারী ও বেতন',
      products: 'পণ্য ও পিওএস',
      inventory: 'ইনভেন্টরি ও COGS',
      users: 'ব্যবহারকারী ব্যবস্থাপনা',
      'add-user': 'নতুন ব্যবহারকারী',
      roles: 'ভূমিকা ব্যবস্থাপনা',
      permissions: 'অনুমতি ম্যাট্রিক্স',
      'registration-requests': 'নিবন্ধন অনুরোধ',
      approvals: 'অনুমোদন ব্যবস্থাপনা',
      'login-history': 'লগইন ইতিহাস',
      'security-logs': 'নিরাপত্তা ও অডিট লগ',
      sessions: 'সেশন ব্যবস্থাপনা',
      'security-dashboard': 'নিরাপত্তা ও থ্রেট কেন্দ্র',
      'device-monitoring': 'ডিভাইস ও OTP লগ',
      'backup-recovery': 'ব্যাকআপ ও রিস্টোর DR',
      'data-recovery': 'ডেটা পুনরুদ্ধার আর্কাইভ',
      'user-profile': 'আমার প্রোফাইল',
      reports: 'রিপোর্টিং ড্যাশবোর্ড',
      'reports-catalog': 'সকল রিপোর্ট কেন্দ্র',
      'reports-analytics': 'ব্যবসা বিশ্লেষণ',
      'reports-builder': 'কাস্টম রিপোর্ট নির্মাতা',
      'reports-scheduler': 'স্বয়ংক্রিয় রিপোর্ট সূচি',
      'reports-archive': 'আর্কাইভ ও রিপোর্ট অডিট',
      notifications: 'বিজ্ঞপ্তি',
      'master-settings': 'মাস্টার সেটিংস',
      'qa-dashboard': 'QA এক্সিকিউটিভ ড্যাশবোর্ড',
      'qa-workbench': 'টেস্ট এক্সিকিউশন ওয়ার্কবেঞ্চ',
      'qa-bugs': 'বাগ, নিরাপত্তা ও পারফরম্যান্স',
      'qa-release': 'UAT, হিসাব ও রিলিজ অনুমোদন',
      'csc-services': 'সিএসসি পরিষেবা ও রেট (৫৫০+)',
      'csc-pvc': 'পিভিসি কার্ড প্রিন্টিং ডেস্ক',
      'csc-orders': 'সিএসসি অর্ডার ও ডক ভল্ট',
      'csc-grievances': 'অভিযোগ ও আরটিআই ট্র্যাকার',
      'csc-schemes': 'PM-JAY, MMSBY, NPCI ও সাইবার ১৯৩০',
      'csc-operators': 'অপারেটর নিয়ন্ত্রণ (১১ অনুমতি)',
      'customer-portal': 'নাগরিক স্ব-সেবা পোর্টাল',
      settings: 'সিস্টেম আর্কিটেকচার',
    },
    dashboardWidgets: {
      'Total Customers': 'মোট গ্রাহক',
      'Total Applications': 'মোট আবেদন',
      'Today Collection': 'আজকের আদায়',
      'Pending Payments': 'বকেয়া পেমেন্ট',
      'Total Expenses': 'মোট খরচ',
      'Today Profit': 'আজকের লাভ',
      'Recent Activities': 'সাম্প্রতিক কার্যক্রম',
      'Pending Approvals': 'অপেক্ষমাণ অনুমোদন',
      'Service-wise Reports': 'পরিষেবা ভিত্তিক রিপোর্ট',
      'Monthly Collection': 'মাসিক সংগ্রহ',
    },
    reportsTitle: 'রিপোর্ট ও এক্সপোর্ট কেন্দ্র',
    exportPdf: 'প্রিন্ট / PDF সংরক্ষণ',
    exportCsv: 'CSV ডাউনলোড',
    exportExcel: 'Excel (.xls) ডাউনলোড',
  },
  hi: {
    appTagline: 'बिज़नेस मैनेजमेंट सूट',
    workspace: 'कार्यक्षेत्र',
    quickAdd: 'त्वरित जोड़ें',
    searchPlaceholder: 'ग्राहक, आवेदन, मॉड्यूल खोजें...',
    notifications: 'सूचनाएं',
    markAllRead: 'सभी पढ़ा हुआ मानें',
    signOut: 'लॉग आउट',
    lightMode: 'लाइट',
    darkMode: 'डार्क',
    saveChanges: 'परिवर्तन सहेजें',
    cancel: 'रद्द करें',
    confirm: 'पुष्टि करें',
    refreshView: 'डेटा रीफ़्रेश करें',
    newApplication: 'नया आवेदन',
    addCustomer: 'ग्राहक जोड़ें',
    newPayment: 'नया भुगतान',
    createReceipt: 'रसीद बनाएं',
    addExpense: 'खर्च जोड़ें',
    quickActions: 'त्वरित कार्य',
    operationsDashboard: 'ऑपरेशंस डैशबोर्ड',
    today: 'आज',
    thisWeek: 'इस सप्ताह',
    thisMonth: 'इस माह',
    customizableWidgets: 'विजेट कस्टमाइज़',
    masterSettingsTitle: 'मास्टर सेटिंग्स और ग्लोबल कॉन्फ़िगरेशन',
    masterSettingsSubtitle: 'MUN COMPUTER के लिए कंपनी प्रोफ़ाइल, सेवा दरें, भाषा, सुरक्षा, बैकअप और अनुमोदन नियंत्रण।',
    searchSettingsPlaceholder: 'सेटिंग्स मॉड्यूल खोजें...',
    managerProposalBanner: 'प्रबंधक एक्सेस मोड: सीधे मास्टर सेटिंग्स परिवर्तन के लिए एडमिन अनुमोदन आवश्यक है। आप अनुमत मॉड्यूल के लिए प्रस्ताव भेज सकते हैं।',
    navGroups: {
      Overview: 'अवलोकन',
      'CSC Digital Center': 'सीएससी डिजिटल केंद्र',
      'Citizen Portal': 'नागरिक पोर्टल',
      Operations: 'संचालन',
      Finance: 'वित्त',
      'Catalog & Team': 'कैटलॉग और टीम',
      'Reports & BI': 'रिपोर्ट और विश्लेषण',
      'Security & Access': 'सुरक्षा और एक्सेस',
      'Quality & Release': 'गुणवत्ता और रिलीज़ (QA)',
      System: 'सिस्टम',
    },
    navLabels: {
      dashboard: 'डैशबोर्ड',
      customers: 'ग्राहक',
      services: 'सेवाएं',
      applications: 'आवेदन',
      transactions: 'लेनदेन',
      cashbook: 'कैशबुक',
      expenses: 'खर्च',
      income: 'आय',
      'finance-hub': 'फाइनेंशियल इंजन (01–94)',
      'chart-of-accounts': 'अकाउंट चार्ट और वाउचर',
      'banking-csp': 'बैंकिंग, BRS और PNB CSP',
      employees: 'कर्मचारी और पेरोल',
      products: 'उत्पाद और POS',
      inventory: 'इन्वेंटरी और COGS',
      users: 'उपयोगकर्ता प्रबंधन',
      'add-user': 'नया उपयोगकर्ता जोड़ें',
      roles: 'भूमिका प्रबंधन',
      permissions: 'अनुमति मैट्रिक्स',
      'registration-requests': 'पंजीकरण अनुरोध',
      approvals: 'अनुमोदन प्रबंधन',
      'login-history': 'लॉगिन इतिहास',
      'security-logs': 'सुरक्षा और ऑडिट लॉग',
      sessions: 'सत्र प्रबंधन',
      'security-dashboard': 'सुरक्षा और थ्रेट केंद्र',
      'device-monitoring': 'डिवाइस और OTP लॉग',
      'backup-recovery': 'बैकअप और रीस्टोर DR',
      'data-recovery': 'डेटा रिकवरी आर्काइव',
      'user-profile': 'मेरी प्रोफ़ाइल',
      reports: 'रिपोर्टिंग डैशबोर्ड',
      'reports-catalog': 'सभी रिपोर्ट केंद्र',
      'reports-analytics': 'बिजनेस एनालिटिक्स',
      'reports-builder': 'कस्टम रिपोर्ट बिल्डर',
      'reports-scheduler': 'शेड्यूल्ड रिपोर्ट्स',
      'reports-archive': 'आर्काइव और रिपोर्ट ऑडिट',
      notifications: 'सूचनाएं',
      'master-settings': 'मास्टर सेटिंग्स',
      'qa-dashboard': 'QA कार्यकारी डैशबोर्ड',
      'qa-workbench': 'टेस्ट निष्पादन कार्यक्षेत्र',
      'qa-bugs': 'बग, सुरक्षा और प्रदर्शन',
      'qa-release': 'UAT, मिलान और रिलीज़ अनुमोदन',
      'csc-services': 'सीएससी सेवाएं और दरें (550+)',
      'csc-pvc': 'पीवीसी कार्ड प्रिंटिंग डेस्क',
      'csc-orders': 'सीएससी ऑर्डर और डॉक वॉल्ट',
      'csc-grievances': 'शिकायत और आरटीआई ट्रैकर',
      'csc-schemes': 'PM-JAY, MMSBY, NPCI और साइबर 1930',
      'csc-operators': 'ऑपरेटर नियंत्रण (11 अनुमतियाँ)',
      'customer-portal': 'नागरिक स्व-सेवा पोर्टल',
      settings: 'सिस्टम आर्किटेक्चर',
    },
    dashboardWidgets: {
      'Total Customers': 'कुल ग्राहक',
      'Total Applications': 'कुल आवेदन',
      'Today Collection': 'आज का संग्रह',
      'Pending Payments': 'बकाया भुगतान',
      'Total Expenses': 'कुल खर्च',
      'Today Profit': 'आज का लाभ',
      'Recent Activities': 'हाल की गतिविधियाँ',
      'Pending Approvals': 'लंबित अनुमोदन',
      'Service-wise Reports': 'सेवा-वार रिपोर्ट',
      'Monthly Collection': 'मासिक संग्रह',
    },
    reportsTitle: 'रिपोर्ट और एक्सपोर्ट केंद्र',
    exportPdf: 'प्रिंट / PDF सहेजें',
    exportCsv: 'CSV एक्सपोर्ट',
    exportExcel: 'Excel (.xls) एक्सपोर्ट',
  },
};

interface LanguageContextValue {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: TranslationDictionary;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  setLanguage: () => {},
  t: TRANSLATIONS.en,
});

export const LanguageProvider: React.FC<{
  language: LanguageCode;
  onChangeLanguage: (lang: LanguageCode) => void;
  children: React.ReactNode;
}> = ({ language, onChangeLanguage, children }) => {
  return React.createElement(
    LanguageContext.Provider,
    {
      value: {
        language,
        setLanguage: onChangeLanguage,
        t: TRANSLATIONS[language] ?? TRANSLATIONS.en,
      },
    },
    children
  );
};

export function useLanguage() {
  return useContext(LanguageContext);
}
