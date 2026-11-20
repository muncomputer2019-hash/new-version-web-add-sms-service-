import { RAW_CSC_CATALOG, RAW_PMJAY_SERVICES, INITIAL_PVC_CARD_TYPE_NAMES } from './cscCatalogSeed.js';
import { GRIEVANCE_SERVICE_TYPES } from './cscTypes.js';

export interface SeedCategoryDef {
  id: number;
  code: string;
  name: string;
  description: string;
  displayOrder: number;
}

export interface SeedSubcategoryDef {
  id: number;
  code: string;
  categoryId: number;
  categoryCode: string;
  categoryName: string;
  name: string;
  description: string;
  displayOrder: number;
}

export interface SeedServiceDef {
  id: number;
  serviceId: string;
  serviceCode: string;
  name: string;
  categoryId: number;
  categoryCode: string;
  categoryName: string;
  subcategoryId: number;
  subcategoryCode: string;
  subcategoryName: string;
  description: string;
  displayOrder: number;
  expectedDays: number;
  requiredDocuments: Array<{
    docKey: string;
    label: string;
    category: string;
    required: boolean;
  }>;
  serviceInstructions: string;
}

function getRawItems(rawCode: string): Array<{ name: string; subGroup?: string }> {
  return RAW_CSC_CATALOG.find((c) => c.code === rawCode)?.items ?? [];
}

function sliceNames(rawCode: string, start: number, end?: number): string[] {
  return getRawItems(rawCode)
    .slice(start, end)
    .map((x) => x.name);
}

interface RawCategoryBuildInput {
  code: string;
  name: string;
  description: string;
  expectedDays?: number;
  serviceInstructions?: string;
  subcategories: Array<{
    name: string;
    description: string;
    services: string[];
  }>;
}

function dedupeCyberItems(subGroupName: string): string[] {
  const cyberItems = getRawItems('CYBER-CRIME');
  const seenBefore = new Set<string>();
  const result: string[] = [];

  for (const item of cyberItems) {
    const normalized = item.name.trim().toLowerCase().replace(/^online blackmail complaint$/, 'blackmail complaint');
    if (item.subGroup === subGroupName) {
      if (!seenBefore.has(normalized)) {
        result.push(item.name);
      }
    }
    seenBefore.add(normalized);
  }
  return result;
}

const RAW_21_CATEGORIES: RawCategoryBuildInput[] = [
  {
    code: 'CAT-01',
    name: 'Government Scheme Services',
    description: 'West Bengal state welfare schemes and Central Government citizen benefit schemes.',
    expectedDays: 5,
    subcategories: [
      {
        name: 'West Bengal Government Schemes',
        description: 'Lakshmir Bhandar, Swasthya Sathi, Krishak Bandhu, Kanyashree, Pensions & Duare Sarkar schemes.',
        services: sliceNames('WB-GOV', 0),
      },
      {
        name: 'Central Government Schemes',
        description: 'PM-KISAN, PMAY, Ujjwala, Vishwakarma, NPS, APY, e-Shram, EPFO, ESIC & NSP.',
        services: sliceNames('CENTRAL-GOV', 0),
      },
    ],
  },
  {
    code: 'CAT-02',
    name: 'Identity & Document Services',
    description: 'Aadhaar, PAN, Voter ID (EPIC), Ration Card, Driving Licence, Passport & Vital document assistance.',
    expectedDays: 5,
    subcategories: [
      {
        name: 'Aadhaar Services',
        description: 'Aadhaar PVC card, download, print, updates & status tracking.',
        services: sliceNames('IDENTITY-DOCS', 0, 9),
      },
      {
        name: 'PAN Card Services',
        description: 'New PAN, corrections, e-PAN download & Aadhaar linking status.',
        services: sliceNames('IDENTITY-DOCS', 9, 14),
      },
      {
        name: 'Voter ID (EPIC) Services',
        description: 'New voter registration, corrections, downloads & voter list lookup.',
        services: sliceNames('IDENTITY-DOCS', 14, 20),
      },
      {
        name: 'Ration Card Services',
        description: 'Digital ration card application, corrections, member add/delete & status.',
        services: sliceNames('IDENTITY-DOCS', 20, 25),
      },
      {
        name: 'Driving Licence & Vehicle Services',
        description: 'Learner & driving licence applications and vehicle RC download.',
        services: sliceNames('IDENTITY-DOCS', 25, 29),
      },
      {
        name: 'Passport & Vital Documents',
        description: 'Passport Seva appointments, status, birth/death downloads & general ID assistance.',
        services: sliceNames('IDENTITY-DOCS', 29),
      },
    ],
  },
  {
    code: 'CAT-03',
    name: 'Certificate & Land Services',
    description: 'Domicile, Income, Caste (SC/ST/OBC), EWS, Vital certificates, Khatian/Porcha & Land mutation.',
    expectedDays: 7,
    subcategories: [
      {
        name: 'Statutory & Category Certificates',
        description: 'Residential, domicile, income, caste, EWS, minority, disability & legal heir certificates.',
        services: sliceNames('CERT-LAND', 0, 11),
      },
      {
        name: 'Vital & Marriage Registration',
        description: 'Birth, death and marriage certificate application assistance.',
        services: sliceNames('CERT-LAND', 11, 14),
      },
      {
        name: 'Land Records, Mutation & Property',
        description: 'Khatian, plot/mouza search, RS/LR info, mutation, conversion, tax & Porcha/deed support.',
        services: sliceNames('CERT-LAND', 14),
      },
    ],
  },
  {
    code: 'CAT-04',
    name: 'Grievance, Complaint & RTI Services',
    description: 'WB Govt, MLA/MP, District Admin, Central CPGRAMS, RTI & Appeals, Consumer complaints & Drafting workflow.',
    expectedDays: 5,
    subcategories: [
      {
        name: 'Grievance Assistance Workflow',
        description: 'Core drafting, online filing, RTI appeals, status tracking, acknowledgement & follow-up services.',
        services: [...GRIEVANCE_SERVICE_TYPES],
      },
      {
        name: 'West Bengal Government Grievance',
        description: 'CMO, Duare Sarkar, Bangla Sahayata Kendra, scheme, electricity & state complaints.',
        services: getRawItems('GRIEVANCE-RTI')
          .filter((i) => i.subGroup === 'West Bengal Government Grievance')
          .map((i) => i.name),
      },
      {
        name: 'MLA / MP / Public Representative',
        description: 'MLA, MP, Panchayat, Municipality and Councillor level grievance petitions.',
        services: getRawItems('GRIEVANCE-RTI')
          .filter((i) => i.subGroup === 'MLA / MP / Public Representative')
          .map((i) => i.name),
      },
      {
        name: 'District Administration',
        description: 'DM, ADM, SDO, BDO, BLLRO, SP and district departmental complaints.',
        services: getRawItems('GRIEVANCE-RTI')
          .filter((i) => i.subGroup === 'District Administration')
          .map((i) => i.name),
      },
      {
        name: 'Higher Authority & Central Government',
        description: 'PMO, Governor, Commissions, CPGRAMS, EPFO, Railway, Banking & Central grievances.',
        services: getRawItems('GRIEVANCE-RTI')
          .filter((i) => i.subGroup === 'Higher Authority & Central Government')
          .map((i) => i.name),
      },
      {
        name: 'RTI Services',
        description: 'Central & WB RTI applications, departmental RTIs, First & Second appeals.',
        services: getRawItems('GRIEVANCE-RTI')
          .filter((i) => i.subGroup === 'RTI Services')
          .map((i) => i.name),
      },
      {
        name: 'Consumer & Public Grievance',
        description: 'National Consumer Helpline, Consumer Court, utility, hospital & public complaints.',
        services: getRawItems('GRIEVANCE-RTI')
          .filter((i) => i.subGroup === 'Consumer & Public Grievance')
          .map((i) => i.name),
      },
    ],
  },
  {
    code: 'CAT-05',
    name: 'Job & Examination Services',
    description: 'WBPSC, WBCS, Police, TET, SSC, RRB, UPSC, IBPS, GDS, Defence recruitment & exam support.',
    expectedDays: 2,
    subcategories: [
      {
        name: 'State & West Bengal Recruitment',
        description: 'General job applications, WBPSC, WBCS, WB Police, Kolkata Police & WBSSC.',
        services: sliceNames('JOB-EXAM', 0, 7),
      },
      {
        name: 'Teaching & Eligibility Tests (TET)',
        description: 'WB Primary TET and WB Upper Primary TET application assistance.',
        services: sliceNames('JOB-EXAM', 7, 9),
      },
      {
        name: 'SSC & Railway Recruitment',
        description: 'SSC CGL/CHSL/MTS/GD and RRB NTPC/Group D/ALP/Technician applications.',
        services: sliceNames('JOB-EXAM', 9, 19),
      },
      {
        name: 'UPSC, Banking, Postal & Defence',
        description: 'UPSC, IBPS, SBI, India Post GDS, Army, Navy & Air Force recruitments.',
        services: sliceNames('JOB-EXAM', 19, 27),
      },
      {
        name: 'Admit Cards, Results & Exam Support',
        description: 'Admit cards, results, answer keys, merit lists, corrections & exam fee payment.',
        services: sliceNames('JOB-EXAM', 27),
      },
    ],
  },
  {
    code: 'CAT-06',
    name: 'Education & Student Services',
    description: 'School/college admissions, SVMCM/Oasis/NSP scholarships, Student Credit Card, DigiLocker & APAAR ID.',
    expectedDays: 3,
    subcategories: [
      {
        name: 'Admissions & Fee Payments',
        description: 'School, college, university admission forms and institutional fee payment assistance.',
        services: [
          ...sliceNames('EDUCATION', 0, 3),
          ...sliceNames('EDUCATION', 11, 13),
          ...sliceNames('EDUCATION', 19, 22),
        ],
      },
      {
        name: 'Scholarships & Student Credit Card',
        description: 'Aikyashree, SVMCM, OASIS, NSP, Kanyashree, Sikhashree & Student Credit Card.',
        services: [
          ...sliceNames('EDUCATION', 3, 11),
          ...sliceNames('EDUCATION', 22, 24),
        ],
      },
      {
        name: 'Results, Marksheets & Digital Student IDs',
        description: 'Admit cards, results, marksheets, migration, DigiLocker, ABC ID & APAAR ID.',
        services: [
          ...sliceNames('EDUCATION', 13, 19),
          ...sliceNames('EDUCATION', 24),
        ],
      },
    ],
  },
  {
    code: 'CAT-07',
    name: 'Printing & Digital Services',
    description: 'B&W/colour printing, scanning, lamination, passport photos, PDF tools, typing, CV & DSC.',
    expectedDays: 1,
    subcategories: [
      {
        name: 'Print, Scan & Lamination',
        description: 'Black & white print, colour print, photocopy, scanning and document lamination.',
        services: sliceNames('PRINT-DIGITAL', 0, 5),
      },
      {
        name: 'Photo & Image Processing',
        description: 'Passport & stamp size photos, photo editing, background change & document resize.',
        services: sliceNames('PRINT-DIGITAL', 5, 10),
      },
      {
        name: 'PDF & File Utilities',
        description: 'PDF creation, merge, split, compression, image-to-PDF and PDF-to-image conversion.',
        services: sliceNames('PRINT-DIGITAL', 10, 16),
      },
      {
        name: 'Typing, Resume & Digital Submissions',
        description: 'English/Bengali typing, resume/biodata drafting, online uploads, DSC & formatting.',
        services: sliceNames('PRINT-DIGITAL', 16),
      },
    ],
  },
  {
    code: 'CAT-08',
    name: 'PVC Card Printing Services',
    description: 'Individual & wholesale PVC card printing workflow and supported official PVC card types.',
    expectedDays: 1,
    subcategories: [
      {
        name: 'Individual PVC Printing',
        description: 'Single, multiple, customer-wise PVC orders, reprints and delivery tracking.',
        services: getRawItems('PVC-PRINTING')
          .filter((i) => i.subGroup === 'Individual PVC Printing')
          .map((i) => i.name),
      },
      {
        name: 'Wholesale PVC Printing',
        description: 'Wholesale shop registration, slab rates, bulk orders, wholesale payments & dues.',
        services: getRawItems('PVC-PRINTING')
          .filter((i) => i.subGroup === 'Wholesale PVC Printing')
          .map((i) => i.name),
      },
      {
        name: 'PVC Card Types',
        description: 'Supported thermal duplex waterproof PVC card printing formats.',
        services: [...INITIAL_PVC_CARD_TYPE_NAMES],
      },
    ],
  },
  {
    code: 'CAT-09',
    name: 'Recharge & Bill Payment',
    description: 'Mobile, DTH, WBSEDCL/CESC electricity, water, gas, LPG, broadband, FASTag & EMI bills.',
    expectedDays: 1,
    subcategories: [
      {
        name: 'Mobile & DTH Recharge',
        description: 'Prepaid, postpaid mobile recharges and DTH recharge services.',
        services: sliceNames('RECHARGE-BILL', 0, 4),
      },
      {
        name: 'Electricity & Utility Bills',
        description: 'WBSEDCL, CESC, water, piped gas, LPG, broadband, landline & FASTag.',
        services: sliceNames('RECHARGE-BILL', 4, 13),
      },
      {
        name: 'Insurance, Loan & Card Bills',
        description: 'Insurance premiums, loan EMI, credit card bills & miscellaneous utilities.',
        services: sliceNames('RECHARGE-BILL', 13),
      },
    ],
  },
  {
    code: 'CAT-10',
    name: 'Travel & Ticket Booking',
    description: 'Train, bus, flight, hotel booking assistance and authorized IRCTC support.',
    expectedDays: 1,
    subcategories: [
      {
        name: 'Train & IRCTC Services',
        description: 'Train booking, PNR check, seat availability, timetable, cancellation & IRCTC.',
        services: [
          ...sliceNames('TRAVEL-TICKET', 0, 5),
          ...sliceNames('TRAVEL-TICKET', 10, 11),
        ],
      },
      {
        name: 'Bus, Flight, Hotel & Travel Docs',
        description: 'Bus/flight tickets, flight status, hotel & tour packages, itinerary printing.',
        services: [
          ...sliceNames('TRAVEL-TICKET', 5, 10),
          ...sliceNames('TRAVEL-TICKET', 11),
        ],
      },
    ],
  },
  {
    code: 'CAT-11',
    name: 'Business & Tax Services',
    description: 'Udyam MSME, GST, ITR, PAN/TAN, Trade Licence, FSSAI, DSC & business documentation.',
    expectedDays: 5,
    subcategories: [
      {
        name: 'Udyam MSME & Business Licences',
        description: 'Udyam registration/download, Trade licence, Shop Act, FSSAI & DSC.',
        services: [
          ...sliceNames('BUSINESS-TAX', 0, 3),
          ...sliceNames('BUSINESS-TAX', 10, 15),
        ],
      },
      {
        name: 'GST & Income Tax Services',
        description: 'GST registration, returns, downloads, ITR, PAN/TAN & tax payments.',
        services: [
          ...sliceNames('BUSINESS-TAX', 3, 10),
          ...sliceNames('BUSINESS-TAX', 19),
        ],
      },
      {
        name: 'Business Documentation & Invoicing',
        description: 'Partnership deed typing, project reports, invoice creation & business printing.',
        services: sliceNames('BUSINESS-TAX', 15, 19),
      },
    ],
  },
  {
    code: 'CAT-12',
    name: 'Banking & Financial Services',
    description: 'Bank account opening, KYC, authorized AEPS/Micro ATM, DBT seeding, loans & insurance.',
    expectedDays: 2,
    serviceInstructions: 'AEPS and Micro ATM transactions are strictly operated via authorized banking correspondents.',
    subcategories: [
      {
        name: 'Account Opening, KYC & Statements',
        description: 'Savings & Jan Dhan accounts, KYC updates, passbook printing & mini statements.',
        services: sliceNames('BANKING-FINANCE', 0, 8),
      },
      {
        name: 'Transfers, AEPS & DBT Mapping',
        description: 'NEFT/RTGS/IMPS, authorized AEPS/Micro ATM, bank seeding & DBT status.',
        services: sliceNames('BANKING-FINANCE', 8, 15),
      },
      {
        name: 'Loans, Insurance & Financial Grievances',
        description: 'Personal/business/agri loan assistance, insurance, pension & financial complaints.',
        services: sliceNames('BANKING-FINANCE', 15),
      },
    ],
  },
  {
    code: 'CAT-13',
    name: 'Labour & Employment Services',
    description: 'e-Shram, Labour Card, Construction Worker, MGNREGA, EPFO UAN & ESIC services.',
    expectedDays: 4,
    subcategories: [
      {
        name: 'e-Shram & Labour Cards',
        description: 'e-Shram registration/download, Labour card applications, renewal & welfare schemes.',
        services: sliceNames('LABOUR-EMPLOYMENT', 0, 8),
      },
      {
        name: 'Employment & MGNREGA',
        description: 'Employment exchange, job seeker registration, job card & MGNREGA work status.',
        services: sliceNames('LABOUR-EMPLOYMENT', 8, 13),
      },
      {
        name: 'EPFO & ESIC Services',
        description: 'PF balance check, UAN assistance, PF withdrawal, ESIC card & labour grievances.',
        services: sliceNames('LABOUR-EMPLOYMENT', 13),
      },
    ],
  },
  {
    code: 'CAT-14',
    name: 'Police, Legal & Safety Services',
    description: 'Police complaints, FIR/GD assistance, verification, affidavits, agreements & e-Courts.',
    expectedDays: 3,
    subcategories: [
      {
        name: 'Police Complaints, GD & Verification',
        description: 'Police/lost mobile/document complaints, GD, character & tenant verification.',
        services: sliceNames('POLICE-LEGAL', 0, 10),
      },
      {
        name: 'Legal Drafting & Affidavits',
        description: 'Legal notices, affidavits, agreements, rent agreements & general drafting.',
        services: sliceNames('POLICE-LEGAL', 10, 15),
      },
      {
        name: 'Courts, Legal Aid & Safety',
        description: 'Court case status, e-Courts, legal aid, women safety & emergency contact info.',
        services: sliceNames('POLICE-LEGAL', 15),
      },
    ],
  },
  {
    code: 'CAT-15',
    name: 'Health & Medical Services',
    description: 'Hospital appointments, ABHA Health ID, health record linking & scheme guidance.',
    expectedDays: 2,
    subcategories: [
      {
        name: 'Hospital & Appointments',
        description: 'Hospital & doctor appointments, blood group directory & medical report printing/scanning.',
        services: sliceNames('HEALTH-MEDICAL', 0, 7),
      },
      {
        name: 'ABHA Health ID & Records',
        description: 'ABHA ID creation, card download/print & digital health record linking.',
        services: sliceNames('HEALTH-MEDICAL', 7, 12),
      },
      {
        name: 'Health Schemes & Grievances',
        description: 'Ayushman Bharat, MMSBY navigation, eligibility, insurance & hospital grievances.',
        services: sliceNames('HEALTH-MEDICAL', 12),
      },
    ],
  },
  {
    code: 'CAT-16',
    name: 'Online Document & Certificate Download',
    description: 'Official downloads for Aadhaar, PAN, EPIC, Ration, Certificates, Porcha, DL/RC & DigiLocker.',
    expectedDays: 1,
    subcategories: [
      {
        name: 'Identity & Ration Card Downloads',
        description: 'Aadhaar, PAN, Voter ID and Digital Ration Card downloads.',
        services: sliceNames('DOC-DOWNLOAD', 0, 4),
      },
      {
        name: 'Certificates & Land Record Downloads',
        description: 'Birth, death, caste, income, domicile, EWS, marriage & Khatian/Porcha downloads.',
        services: sliceNames('DOC-DOWNLOAD', 4, 15),
      },
      {
        name: 'Transport, Health, Labour & DigiLocker Downloads',
        description: 'DL/RC, Ayushman, ABHA, e-Shram, Labour, scholarship, marksheet & DigiLocker.',
        services: sliceNames('DOC-DOWNLOAD', 15),
      },
    ],
  },
  {
    code: 'CAT-17',
    name: 'Other Online & Citizen Services',
    description: 'DigiLocker, UMANG, portal registration, online appointments & general citizen assistance.',
    expectedDays: 2,
    subcategories: [
      {
        name: 'Digital Portals & Account Access',
        description: 'DigiLocker, UMANG app, govt portal registration, mobile/email update assistance.',
        services: sliceNames('CITIZEN-OTHER', 0, 6),
      },
      {
        name: 'General Citizen Applications & Tracking',
        description: 'Document verification, govt application tracking, appointments & online payments.',
        services: sliceNames('CITIZEN-OTHER', 6),
      },
    ],
  },
  {
    code: 'CAT-18',
    name: 'NPCI & Digital Payment Services',
    description: 'Aadhaar Seeding/Mapper, UPI, BHIM & FASTag, NACH/APB/DBT & NPCI Dispute tracking.',
    expectedDays: 2,
    serviceInstructions: 'NPCI-related mapper/payment actions must be routed through the relevant bank, PSP, or authorized official channel.',
    subcategories: [
      {
        name: 'Aadhaar Seeding & NPCI Mapper',
        description: 'Seeding status, bank mapping, DBT status, de-seeding & mapping complaints.',
        services: getRawItems('NPCI-PAYMENTS')
          .filter((i) => i.subGroup === 'Aadhaar Seeding & NPCI Mapper')
          .map((i) => i.name),
      },
      {
        name: 'UPI Services',
        description: 'UPI registration, PIN guidance, failed/pending transactions, AutoPay & fraud reporting.',
        services: getRawItems('NPCI-PAYMENTS')
          .filter((i) => i.subGroup === 'UPI Services')
          .map((i) => i.name),
      },
      {
        name: 'BHIM & FASTag',
        description: 'BHIM support, FASTag status, recharge, blacklist, double deduction & closure.',
        services: getRawItems('NPCI-PAYMENTS')
          .filter((i) => i.subGroup === 'BHIM & FASTag')
          .map((i) => i.name),
      },
      {
        name: 'NACH / APB / DBT',
        description: 'NACH mandate management, APB, subsidy/scholarship/pension/LPG DBT complaints.',
        services: getRawItems('NPCI-PAYMENTS')
          .filter((i) => i.subGroup === 'NACH / APB / DBT')
          .map((i) => i.name),
      },
      {
        name: 'NPCI Grievance',
        description: 'UPI, Aadhaar seeding, FASTag & digital payment dispute tracking and DigiSaathi.',
        services: getRawItems('NPCI-PAYMENTS')
          .filter((i) => i.subGroup === 'NPCI Grievance')
          .map((i) => i.name),
      },
    ],
  },
  {
    code: 'CAT-19',
    name: 'Cyber Crime Cell & Online Fraud Services',
    description: 'National Cyber Crime Portal, Financial Fraud, Social Media, Mobile/Email, Women & Child Safety & Cyber Police.',
    expectedDays: 1,
    serviceInstructions: 'Emergency Notice: For financial cyber fraud, immediately call Helpline 1930 and contact the bank while filing at https://cybercrime.gov.in/.',
    subcategories: [
      {
        name: 'National Cyber Crime Portal',
        description: 'Portal registration, complaint filing, acknowledgement check & follow-up assistance.',
        services: dedupeCyberItems('National Cyber Crime Portal'),
      },
      {
        name: 'Financial Cyber Fraud',
        description: 'UPI, GPay, PhonePe, Paytm, bank/ATM/card, OTP, phishing, QR & loan app fraud.',
        services: dedupeCyberItems('Financial Cyber Fraud'),
      },
      {
        name: 'Social Media & Account Hacking',
        description: 'Facebook, Instagram, WhatsApp, Telegram hacking, impersonation, blackmail & defamation.',
        services: dedupeCyberItems('Social Media & Account Hacking'),
      },
      {
        name: 'Mobile, Email & E-commerce',
        description: 'Email hacking, SIM fraud, fake websites, identity theft & e-commerce disputes.',
        services: dedupeCyberItems('Mobile, Email & E-commerce'),
      },
      {
        name: 'Women & Child Cyber Safety',
        description: 'Online harassment, child online safety & cyber sexual harassment complaints.',
        services: dedupeCyberItems('Women & Child Cyber Safety'),
      },
      {
        name: 'Cyber Police & Emergency Assistance',
        description: 'Local/District Cyber Cell complaints, police station/SP drafting, FIR copy & bank disputes.',
        services: dedupeCyberItems('Cyber Police & Emergency Assistance'),
      },
    ],
  },
  {
    code: 'CAT-20',
    name: 'MMSBY Services',
    description: 'Dedicated Mukhyamantri Swasthya Bima Yojana (MMSBY) eligibility, e-KYC, card print, hospital info & grievance.',
    expectedDays: 3,
    serviceInstructions: 'MMSBY and Swasthya Sathi are separate schemes; verify official scheme eligibility and portal before processing.',
    subcategories: [
      {
        name: 'Eligibility & e-KYC',
        description: 'Beneficiary eligibility, new registration, Aadhaar e-KYC, OTP & family verification.',
        services: sliceNames('MMSBY-HEALTH', 0, 7),
      },
      {
        name: 'Corrections & Verification',
        description: 'Aadhaar, name, DOB, gender, mobile updates & ration card verification.',
        services: sliceNames('MMSBY-HEALTH', 7, 13),
      },
      {
        name: 'Card Download & Printing',
        description: 'Application status, MMSBY beneficiary card download, print & duplicate card.',
        services: sliceNames('MMSBY-HEALTH', 13, 17),
      },
      {
        name: 'Hospitals, Treatment & Grievances',
        description: 'Empanelled hospitals, cashless benefits, hospital & pending e-KYC grievances.',
        services: sliceNames('MMSBY-HEALTH', 17),
      },
    ],
  },
  {
    code: 'CAT-21',
    name: 'Ayushman Bharat PM-JAY Services',
    description: 'Dedicated PM-JAY eligibility, Aadhaar/biometric e-KYC, card download, hospital search & grievance.',
    expectedDays: 2,
    serviceInstructions: 'Only officially supported PM-JAY authentication methods (OTP, Face Auth, Biometric/IRIS) are permitted.',
    subcategories: [
      {
        name: 'Eligibility, Registration & e-KYC',
        description: 'PM-JAY eligibility check, Aadhaar OTP/Face/Biometric/IRIS e-KYC & Aadhaar linking.',
        services: RAW_PMJAY_SERVICES.slice(0, 10),
      },
      {
        name: 'Family Details & Corrections',
        description: 'Family member search/addition, beneficiary verification & demographic corrections.',
        services: RAW_PMJAY_SERVICES.slice(10, 17),
      },
      {
        name: 'Ayushman Card Download & Print',
        description: 'Ayushman Card download, PDF, print, duplicate & family member card download.',
        services: RAW_PMJAY_SERVICES.slice(17, 22),
      },
      {
        name: 'Hospitals & Grievances',
        description: 'Hospital search, empanelled info, cashless benefits, rejection & PM-JAY grievances.',
        services: RAW_PMJAY_SERVICES.slice(22),
      },
    ],
  },
];

export const CATALOG_CATEGORIES_21: SeedCategoryDef[] = [];
export const CATALOG_SUBCATEGORIES: SeedSubcategoryDef[] = [];
export const CATALOG_SERVICES_675: SeedServiceDef[] = [];

(() => {
  let subSeq = 1;
  let srvSeq = 1;

  RAW_21_CATEGORIES.forEach((rawCat, catIdx) => {
    const categoryId = catIdx + 1;
    const categoryDef: SeedCategoryDef = {
      id: categoryId,
      code: rawCat.code,
      name: rawCat.name,
      description: rawCat.description,
      displayOrder: categoryId,
    };
    CATALOG_CATEGORIES_21.push(categoryDef);

    rawCat.subcategories.forEach((rawSub, subIdx) => {
      const subcategoryId = subSeq++;
      const subcategoryCode = `SUB-${String(categoryId).padStart(2, '0')}-${String(subIdx + 1).padStart(2, '0')}`;
      const subDef: SeedSubcategoryDef = {
        id: subcategoryId,
        code: subcategoryCode,
        categoryId,
        categoryCode: rawCat.code,
        categoryName: rawCat.name,
        name: rawSub.name,
        description: rawSub.description,
        displayOrder: subIdx + 1,
      };
      CATALOG_SUBCATEGORIES.push(subDef);

      rawSub.services.forEach((serviceName) => {
        const orderNum = srvSeq++;
        const serviceId = `MCS-2026-27-${String(orderNum).padStart(6, '0')}`;
        const serviceCode = `MC2627SRV-${String(orderNum).padStart(3, '0')}`;
        CATALOG_SERVICES_675.push({
          id: orderNum,
          serviceId,
          serviceCode,
          name: serviceName,
          categoryId,
          categoryCode: rawCat.code,
          categoryName: rawCat.name,
          subcategoryId,
          subcategoryCode,
          subcategoryName: rawSub.name,
          description: `${rawCat.name} · ${rawSub.name} — ${serviceName}`,
          displayOrder: orderNum,
          expectedDays: rawCat.expectedDays ?? 3,
          requiredDocuments: [
            {
              docKey: 'applicant_id_proof',
              label: 'Applicant ID Proof (Masked Aadhaar / Voter ID / PAN)',
              category: 'Identity Proof',
              required: true,
            },
          ],
          serviceInstructions:
            rawCat.serviceInstructions ||
            'MUN COMPUTER provides private filing & digital assistance; statutory outcomes are governed by respective authorities.',
        });
      });
    });
  });
})();
