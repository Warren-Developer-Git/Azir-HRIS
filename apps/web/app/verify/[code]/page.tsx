'use client';

import { DetailPageSkeleton } from '@/components/skeletons';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { CompanyLogo } from '@/components/company-logo';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  ShieldCheck,
  ShieldAlert,
  Calendar,
  Building,
  User,
  Hash,
  FileText,
  Clock,
  ArrowRight,
  Search,
  ExternalLink,
} from 'lucide-react';

interface VerificationResult {
  isValid: boolean;
  documentNo: string;
  documentType: string;
  organization: string;
  maskedEmployeeName: string;
  issuedAt: string;
  status: string;
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  COE: 'Certificate of Employment (COE)',
  COE_COMPENSATION: 'Certificate of Employment with Compensation',
  LEAVE_CERT: 'Leave Balance Certification',
  PAYSLIP: 'Certified Official Payslip',
};

export default function DocumentVerificationPage() {
  const params = useParams();
  const router = useRouter();
  const initialCode = (params?.code as string) || '';

  const [code, setCode] = useState(initialCode);
  const [inputCode, setInputCode] = useState('');
  const [data, setData] = useState<VerificationResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVerification = async (targetCode: string) => {
    if (!targetCode) {
      setError('Verification code is required');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await api<VerificationResult>(`/documents/verify/${encodeURIComponent(targetCode.trim())}`);
      setData(result);
    } catch (err: any) {
      setData(null);
      if (err instanceof ApiError && err.status === 404) {
        setError('This document could not be verified. The code does not match any officially issued record.');
      } else {
        setError(err.message || 'Verification service temporarily unavailable.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialCode) {
      setCode(initialCode);
      fetchVerification(initialCode);
    } else {
      setIsLoading(false);
    }
  }, [initialCode]);

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim()) return;
    router.push(`/verify/${inputCode.trim().toUpperCase()}`);
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 flex flex-col justify-between">
      {/* Top Header */}
      <header className="border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <CompanyLogo className="h-8 w-auto" />
            <div className="hidden sm:block border-l border-neutral-300 dark:border-neutral-700 pl-3">
              <span className="text-xs font-semibold tracking-wider uppercase text-neutral-500 dark:text-neutral-400">
                Official Document Registry
              </span>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/login"
              className="text-xs sm:text-sm font-medium px-3.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 transition-colors inline-flex items-center gap-1.5"
            >
              Employee Portal <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-10 sm:py-16">
        {isLoading ? (
          <DetailPageSkeleton cards={2} />
        ) : data && data.isValid ? (
          /* Valid State */
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-emerald-500/30 dark:border-emerald-500/30 shadow-xl overflow-hidden">
            {/* Verification Banner */}
            <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-6 py-5 flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <div className="flex-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-600 text-white mb-1.5">
                  Verified Official Document
                </div>
                <h1 className="text-lg sm:text-xl font-bold text-neutral-900 dark:text-neutral-100">
                  Authentic Record Confirmed
                </h1>
                <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
                  This document was officially issued and recorded in the Azir Company Enterprise Registry.
                </p>
              </div>
            </div>

            {/* Document Details Grid */}
            <div className="p-6 sm:p-8 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/80 dark:border-neutral-800">
                  <div className="flex items-center gap-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1">
                    <Hash className="w-3.5 h-3.5" /> Serial Number
                  </div>
                  <p className="text-sm sm:text-base font-mono font-bold text-neutral-900 dark:text-neutral-100">
                    {data.documentNo}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/80 dark:border-neutral-800">
                  <div className="flex items-center gap-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1">
                    <FileText className="w-3.5 h-3.5" /> Classification
                  </div>
                  <p className="text-sm sm:text-base font-semibold text-neutral-900 dark:text-neutral-100">
                    {DOCUMENT_TYPE_LABELS[data.documentType] || data.documentType}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/80 dark:border-neutral-800">
                  <div className="flex items-center gap-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1">
                    <User className="w-3.5 h-3.5" /> Subject (Masked for Privacy)
                  </div>
                  <p className="text-sm sm:text-base font-semibold text-neutral-900 dark:text-neutral-100">
                    {data.maskedEmployeeName}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/80 dark:border-neutral-800">
                  <div className="flex items-center gap-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1">
                    <Building className="w-3.5 h-3.5" /> Issuing Organization
                  </div>
                  <p className="text-sm sm:text-base font-semibold text-neutral-900 dark:text-neutral-100">
                    {data.organization}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/80 dark:border-neutral-800">
                  <div className="flex items-center gap-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1">
                    <Calendar className="w-3.5 h-3.5" /> Official Issuance Date
                  </div>
                  <p className="text-sm sm:text-base font-semibold text-neutral-900 dark:text-neutral-100">
                    {new Date(data.issuedAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200/80 dark:border-neutral-800">
                  <div className="flex items-center gap-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1">
                    <Clock className="w-3.5 h-3.5" /> Registry Verification Code
                  </div>
                  <p className="text-xs sm:text-sm font-mono font-semibold break-all text-neutral-900 dark:text-neutral-100">
                    {code}
                  </p>
                </div>
              </div>

              {/* Security Seal Note */}
              <div className="p-4 rounded-xl bg-neutral-100/70 dark:bg-neutral-800/30 border border-neutral-200 dark:border-neutral-800 text-xs text-neutral-600 dark:text-neutral-400 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-neutral-800 dark:text-neutral-200">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" /> Tamper-Evident System Record
                </div>
                <p>
                  This verification confirms that the specified document was generated, approved by authorized personnel, and immutably archived by Azir Company Global Tech. For privacy protection, sensitive personal compensation and detailed metrics are stored encrypted and withheld from public verification displays.
                </p>
              </div>

              {/* Another Search Link */}
              <div className="pt-2 text-center">
                <button
                  onClick={() => {
                    setData(null);
                    setCode('');
                  }}
                  className="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 underline"
                >
                  Verify another document code
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Invalid / Not Found State */
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-red-500/30 dark:border-red-500/30 shadow-xl overflow-hidden">
            <div className="bg-red-500/10 border-b border-red-500/20 px-6 py-5 flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <div className="flex-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-red-600 text-white mb-1.5">
                  Verification Failed
                </div>
                <h1 className="text-lg sm:text-xl font-bold text-neutral-900 dark:text-neutral-100">
                  Unverified or Invalid Record
                </h1>
                <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                  {error || 'The requested verification code could not be matched against any issued records.'}
                </p>
              </div>
            </div>

            <div className="p-6 sm:p-8 space-y-6">
              <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-800 text-sm text-neutral-600 dark:text-neutral-400 space-y-2">
                <p className="font-semibold text-neutral-800 dark:text-neutral-200">
                  Possible reasons for this status:
                </p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>The document is a draft or preview that has not yet been approved by Human Resources.</li>
                  <li>The verification code was misentered or transposed.</li>
                  <li>The document is fraudulent, revoked, or not generated through Azir Company systems.</li>
                </ul>
              </div>

              {/* Manual Lookup Form */}
              <form onSubmit={handleManualSearch} className="space-y-3">
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                  Check Another Verification Code
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={inputCode}
                      onChange={(e) => setInputCode(e.target.value)}
                      placeholder="e.g. 7F4A198B-C12D-4E3A-9F01-..."
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100 font-mono"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-medium text-sm hover:opacity-90 transition-opacity inline-flex items-center gap-1.5"
                  >
                    Verify <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-200 dark:border-neutral-800 py-6 text-center text-xs text-neutral-500">
        <p>&copy; {new Date().getFullYear()} Azir Company Global Tech. All rights reserved. Official DOLE Labor Advisory No. 06-20 Compliant.</p>
      </footer>
    </div>
  );
}
