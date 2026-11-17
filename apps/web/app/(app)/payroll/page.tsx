'use client';

import React, { useState, useEffect, useRef, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError, escapeHtml, getAccessToken } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { COMPANY_LOGO_DATA_URL, HR_SIGNATURE_DATA_URL } from '@/lib/document-assets';
import QRCode from 'qrcode';
import {
  Banknote,
  Calendar,
  CheckCircle,
  Clock,
  Download,
  FileText,
  Lock,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
  User,
  Users,
  X,
  AlertCircle,
  ChevronRight,
  Trash2,
  ExternalLink,
} from 'lucide-react';

interface PayrollPeriod {
  id: string;
  name: string;
  cutoffType: 'FIRST_HALF' | 'SECOND_HALF' | 'MONTHLY';
  startDate: string;
  endDate: string;
  payDate: string;
  workingDays: number;
  _count?: { payrollRuns: number };
}

interface PayrollRun {
  id: string;
  runNumber: string;
  status: 'DRAFT' | 'COMPUTED' | 'APPROVED' | 'LOCKED' | 'PAID';
  totalGross: string | number;
  totalDeductions: string | number;
  totalNet: string | number;
  totalEmployeeContributions: string | number;
  totalEmployerContributions: string | number;
  createdAt: string;
  lockedAt?: string | null;
  payrollPeriod: PayrollPeriod;
  preparedBy: { id: string; firstName: string; lastName: string; employeeNo: string };
  approvedBy?: { id: string; firstName: string; lastName: string; employeeNo: string } | null;
  _count?: { items: number; adjustments: number };
}

interface PayrollItemLine {
  id: string;
  category: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION';
  code: string;
  description: string;
  amount: string | number;
  rate?: string | number | null;
  quantity?: string | number | null;
}

interface PayrollItem {
  id: string;
  employeeId: string;
  basicPay: string | number;
  allowances: string | number;
  overtimePay: string | number;
  absencesDeduction: string | number;
  grossPay: string | number;
  sssEe: string | number;
  sssEr: string | number;
  philHealthEe: string | number;
  philHealthEr: string | number;
  pagIbigEe: string | number;
  pagIbigEr: string | number;
  withholdingTax: string | number;
  otherDeductions: string | number;
  netPay: string | number;
  issuedDocumentId?: string | null;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeNo: string;
    position: string;
    department?: { id: string; name: string } | null;
  };
  lines?: PayrollItemLine[];
}

interface PayrollAdjustment {
  id: string;
  employeeId: string;
  type: 'OVERTIME_HOURS' | 'BONUS' | 'ALLOWANCE' | 'DEDUCTION';
  description: string;
  amount: string | number;
  quantity?: string | number | null;
  employee: { id: string; firstName: string; lastName: string; employeeNo: string };
}

interface RunDetail extends PayrollRun {
  items: PayrollItem[];
  adjustments: PayrollAdjustment[];
}

interface MyPayslipSummary {
  id: string;
  runId: string;
  periodName: string;
  startDate: string;
  endDate: string;
  payDate: string;
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  issuedDocumentId?: string | null;
}

interface EmployeeOption {
  id: string;
  firstName: string;
  lastName: string;
  employeeNo: string;
  position: string;
}

function PayrollContent() {
  const { user, can } = useAuth();
  const isHrOrAdmin = can('payroll.manage') || can('payroll.view.all');
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const targetSlipId = searchParams.get('id') || searchParams.get('slipId');
  const handledSlipRef = useRef<string | null>(null);

  // Navigation
  const [activeTab, setActiveTab] = useState<'runs' | 'periods' | 'my-payslips'>(() => {
    if (tabParam === 'my-payslips') return 'my-payslips';
    if (tabParam === 'periods' && isHrOrAdmin) return 'periods';
    return isHrOrAdmin ? 'runs' : 'my-payslips';
  });

  useEffect(() => {
    if (tabParam === 'my-payslips') {
      setActiveTab('my-payslips');
    } else if (tabParam === 'periods' && isHrOrAdmin) {
      setActiveTab('periods');
    } else if (tabParam === 'runs' && isHrOrAdmin) {
      setActiveTab('runs');
    }
  }, [tabParam, isHrOrAdmin]);

  // Data states
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [myPayslips, setMyPayslips] = useState<MyPayslipSummary[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active run drawer/modal
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailSubTab, setDetailSubTab] = useState<'items' | 'adjustments' | 'remittance'>('items');
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [showAccountingSummary, setShowAccountingSummary] = useState(false);

  // Modals
  const [showCreatePeriodModal, setShowCreatePeriodModal] = useState(false);
  const [showCreateRunModal, setShowCreateRunModal] = useState(false);
  const [showAddAdjustmentModal, setShowAddAdjustmentModal] = useState(false);

  // Create period form
  const [newPeriodName, setNewPeriodName] = useState('');
  const [newPeriodType, setNewPeriodType] = useState<'FIRST_HALF' | 'SECOND_HALF' | 'MONTHLY'>('FIRST_HALF');
  const [newPeriodStartDate, setNewPeriodStartDate] = useState('');
  const [newPeriodEndDate, setNewPeriodEndDate] = useState('');
  const [newPeriodPayDate, setNewPeriodPayDate] = useState('');
  const [newPeriodWorkingDays, setNewPeriodWorkingDays] = useState('11');

  // Create run form
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [newRunNumber, setNewRunNumber] = useState('');

  // Add adjustment form
  const [adjEmployeeId, setAdjEmployeeId] = useState('');
  const [adjType, setAdjType] = useState<'OVERTIME_HOURS' | 'BONUS' | 'ALLOWANCE' | 'DEDUCTION'>('OVERTIME_HOURS');
  const [adjDescription, setAdjDescription] = useState('');
  const [adjQuantity, setAdjQuantity] = useState('8');
  const [adjAmount, setAdjAmount] = useState('0');

  // Payslip viewer sheet modal
  const [viewingPayslipId, setViewingPayslipId] = useState<string | null>(null);
  const [payslipData, setPayslipData] = useState<any | null>(null);
  const [isLoadingPayslip, setIsLoadingPayslip] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);

  // Action states
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Compute live statutory compliance totals from run detail items
  const statutoryStats = useMemo(() => {
    if (!runDetail?.items) return null;
    let sssEe = 0, sssEr = 0;
    let phEe = 0, phEr = 0;
    let piEe = 0, piEr = 0;
    let tax = 0;
    let gross = 0;
    let net = 0;
    let deductions = 0;

    for (const it of runDetail.items) {
      gross += Number(it.grossPay);
      net += Number(it.netPay);
      deductions += (Number(it.grossPay) - Number(it.netPay));
      sssEe += Number(it.sssEe);
      sssEr += Number(it.sssEr);
      phEe += Number(it.philHealthEe);
      phEr += Number(it.philHealthEr);
      piEe += Number(it.pagIbigEe);
      piEr += Number(it.pagIbigEr);
      tax += Number(it.withholdingTax);
    }

    return {
      gross,
      net,
      deductions,
      sss: { ee: sssEe, er: sssEr, total: sssEe + sssEr },
      philHealth: { ee: phEe, er: phEr, total: phEe + phEr },
      pagIbig: { ee: piEe, er: piEr, total: piEe + piEr },
      tax: { total: tax },
      totalEmployeeStatutory: sssEe + phEe + piEe + tax,
      totalEmployerContributions: sssEr + phEr + piEr,
      grandTotalRemittance: (sssEe + sssEr) + (phEe + phEr) + (piEe + piEr) + tax,
    };
  }, [runDetail]);

  const handleExportCsv = async (runId: string, runNumber: string) => {
    setIsExportingCsv(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`/api/payroll/runs/${runId}/export-csv`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        throw new Error('Failed to export payroll register');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payroll-register-${runNumber}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Export failed');
    } finally {
      setIsExportingCsv(false);
    }
  };

  const handlePrintAccountingSummary = () => {
    const printSheet = document.getElementById('printable-accounting-sheet');
    if (!printSheet) return;

    let html = printSheet.innerHTML;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.print();
      return;
    }

    printWindow.document.open();
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Accounting-Summary-${escapeHtml(runDetail?.runNumber || 'Payroll')}</title>
          <style>
            @page { size: A4 portrait; margin: 15mm 15mm 15mm 15mm; }
            * { box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 0; padding: 20px; color: #111; font-size: 11px; line-height: 1.4; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 10.5px; }
            th { background-color: #f7f7f7; font-weight: bold; }
            .no-border td, .no-border th { border: none; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .font-mono { font-family: monospace; }
          </style>
        </head>
        <body>
          ${html}
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Load initial data
  useEffect(() => {
    loadAllData();
  }, [isHrOrAdmin]);

  const loadAllData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (isHrOrAdmin) {
        const [runsData, periodsData, mySlipsData, empRes] = await Promise.all([
          api<PayrollRun[]>('/payroll/runs'),
          api<PayrollPeriod[]>('/payroll/periods'),
          api<MyPayslipSummary[]>('/payroll/my-payslips'),
          api<any>('/employees?pageSize=100').catch(() => ({ data: [] })),
        ]);
        setRuns(Array.isArray(runsData) ? runsData : []);
        setPeriods(Array.isArray(periodsData) ? periodsData : []);
        setMyPayslips(Array.isArray(mySlipsData) ? mySlipsData : []);
        const empList: EmployeeOption[] = Array.isArray(empRes)
          ? empRes
          : Array.isArray(empRes?.data)
          ? empRes.data
          : [];
        setEmployees(empList);
      } else {
        const mySlipsData = await api<MyPayslipSummary[]>('/payroll/my-payslips');
        setMyPayslips(Array.isArray(mySlipsData) ? mySlipsData : []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load payroll records');
    } finally {
      setIsLoading(false);
    }
  };

  const loadRunDetail = async (id: string) => {
    setIsLoadingDetail(true);
    try {
      const data = await api<RunDetail>(`/payroll/runs/${id}`);
      setRunDetail(data);
      setSelectedRunId(id);
    } catch (err: any) {
      alert(err.message || 'Failed to load run details');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPeriodName || !newPeriodStartDate || !newPeriodEndDate || !newPeriodPayDate) {
      alert('Please fill in all required date fields');
      return;
    }
    setIsSubmitting(true);
    try {
      await api('/payroll/periods', {
        method: 'POST',
        body: JSON.stringify({
          name: newPeriodName,
          cutoffType: newPeriodType,
          startDate: newPeriodStartDate,
          endDate: newPeriodEndDate,
          payDate: newPeriodPayDate,
          workingDays: parseInt(newPeriodWorkingDays) || 11,
        }),
      });
      setShowCreatePeriodModal(false);
      setNewPeriodName('');
      await loadAllData();
    } catch (err: any) {
      alert(err.message || 'Failed to create cutoff period');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPeriodId || !newRunNumber) {
      alert('Please select a cutoff period and enter a run number');
      return;
    }
    setIsSubmitting(true);
    try {
      const created = await api<PayrollRun>('/payroll/runs', {
        method: 'POST',
        body: JSON.stringify({
          payrollPeriodId: selectedPeriodId,
          runNumber: newRunNumber,
        }),
      });
      setShowCreateRunModal(false);
      setNewRunNumber('');
      await loadAllData();
      await loadRunDetail(created.id);
    } catch (err: any) {
      alert(err.message || 'Failed to initialize payroll run');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openAddAdjustmentModal = () => {
    const list =
      Array.isArray(employees) && employees.length > 0
        ? employees
        : Array.isArray(runDetail?.items)
        ? runDetail.items.map((it) => it.employee)
        : [];
    if (list.length > 0 && !list.some((e) => e.id === adjEmployeeId)) {
      setAdjEmployeeId(list[0].id);
    }
    setShowAddAdjustmentModal(true);
  };

  const handleAddAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRunId || !adjEmployeeId || !adjDescription) {
      alert('Please fill in employee and description');
      return;
    }
    setIsSubmitting(true);
    try {
      const body: any = {
        employeeId: adjEmployeeId,
        type: adjType,
        description: adjDescription,
      };
      if (adjType === 'OVERTIME_HOURS') {
        body.quantity = parseFloat(adjQuantity) || 0;
      } else {
        body.amount = parseFloat(adjAmount) || 0;
      }

      await api(`/payroll/runs/${selectedRunId}/adjustments`, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      setShowAddAdjustmentModal(false);
      setAdjDescription('');
      await loadRunDetail(selectedRunId);
    } catch (err: any) {
      alert(err.message || 'Failed to add adjustment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAdjustment = async (adjId: string) => {
    if (!selectedRunId || !confirm('Are you sure you want to delete this adjustment?')) return;
    try {
      await api(`/payroll/runs/${selectedRunId}/adjustments/${adjId}`, {
        method: 'DELETE',
      });
      await loadRunDetail(selectedRunId);
    } catch (err: any) {
      alert(err.message || 'Failed to delete adjustment');
    }
  };

  const handleComputeRun = async (runId: string) => {
    setIsSubmitting(true);
    try {
      await api(`/payroll/runs/${runId}/compute`, {
        method: 'POST',
      });
      await loadAllData();
      if (selectedRunId === runId) {
        await loadRunDetail(runId);
      }
    } catch (err: any) {
      alert(err.message || 'Calculation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDecideRun = async (runId: string, action: 'APPROVE' | 'REJECT') => {
    const confirmMsg =
      action === 'APPROVE'
        ? 'Are you sure you want to APPROVE and LOCK this payroll run? This will freeze calculations and automatically distribute official signed payslips to all employees.'
        : 'Are you sure you want to return this run to DRAFT status?';

    if (!confirm(confirmMsg)) return;

    setIsSubmitting(true);
    try {
      await api(`/payroll/runs/${runId}/decision`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      await loadAllData();
      if (selectedRunId === runId) {
        await loadRunDetail(runId);
      }
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openPayslipViewer = async (itemId: string) => {
    setViewingPayslipId(itemId);
    setIsLoadingPayslip(true);
    setPayslipData(null);
    setQrCodeDataUrl(null);

    try {
      const data = await api<any>(`/payroll/my-payslips/${itemId}`);
      setPayslipData(data);

      const verifyCode = data?.verification?.verificationCode || '';
      if (verifyCode && verifyCode !== 'UNVERIFIED') {
        const host = window.location.origin;
        const verifyUrl = `${host}/verify/${verifyCode}`;
        const qrUrl = await QRCode.toDataURL(verifyUrl, { width: 130, margin: 1 });
        setQrCodeDataUrl(qrUrl);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to load official payslip');
      setViewingPayslipId(null);
    } finally {
      setIsLoadingPayslip(false);
    }
  };

  const closePayslipViewer = () => {
    setViewingPayslipId(null);
    setPayslipData(null);
    setQrCodeDataUrl(null);
  };

  // Auto-open payslip preview if linked from notification or URL
  useEffect(() => {
    if (targetSlipId && handledSlipRef.current !== targetSlipId && !isLoading) {
      handledSlipRef.current = targetSlipId;
      openPayslipViewer(targetSlipId);
    }
  }, [targetSlipId, isLoading]);

  // Printing & Saving
  const handlePrintPayslip = () => {
    const printSheet = document.getElementById('printable-payslip-sheet');
    if (!printSheet) return;

    let html = printSheet.innerHTML;
    // Replace inline images with base64 data URIs so print iframe has 100% reliable logo and signature
    html = html.replace(/\/company-logo-mark\.svg/g, COMPANY_LOGO_DATA_URL);
    html = html.replace(/\/signatures\/hr-signature-clean\.png/g, HR_SIGNATURE_DATA_URL);

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Official Payslip - ${payslipData?.verification?.documentNo || 'AZIR'}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 15mm 20mm;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #171717;
              background: #fff;
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .text-center { text-align: center; }
            .font-bold { font-weight: 700; }
            .font-semibold { font-weight: 600; }
            .uppercase { text-transform: uppercase; }
            .tracking-wider { letter-spacing: 0.05em; }
            .tracking-tight { letter-spacing: -0.025em; }
            .grid { display: grid; }
            .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
            .flex { display: flex; }
            .items-center { align-items: center; }
            .items-end { align-items: flex-end; }
            .justify-between { justify-content: space-between; }
            .justify-center { justify-content: center; }
            .border { border: 1px solid #e5e5e5; }
            .border-b { border-bottom: 1px solid #e5e5e5; }
            .border-t { border-top: 1px solid #e5e5e5; }
            .border-neutral-200 { border-color: #e5e5e5; }
            .border-neutral-300 { border-color: #d4d4d4; }
            .bg-neutral-50 { background-color: #fafafa; }
            .bg-neutral-100 { background-color: #f5f5f5; }
            .bg-neutral-900 { background-color: #171717; color: #fff; }
            .p-4 { padding: 1rem; }
            .py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
            .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
            .px-4 { padding-left: 1rem; padding-right: 1rem; }
            .mb-2 { margin-bottom: 0.5rem; }
            .mb-4 { margin-bottom: 1rem; }
            .mb-6 { margin-bottom: 1.5rem; }
            .mt-4 { margin-top: 1rem; }
            .mt-6 { margin-top: 1.5rem; }
            .gap-4 { gap: 1rem; }
            .gap-6 { gap: 1.5rem; }
            .text-xs { font-size: 0.75rem; line-height: 1rem; }
            .text-sm { font-size: 0.875rem; line-height: 1.25rem; }
            .text-base { font-size: 1rem; line-height: 1.5rem; }
            .text-lg { font-size: 1.125rem; line-height: 1.75rem; }
            .text-xl { font-size: 1.25rem; line-height: 1.75rem; }
            .text-2xl { font-size: 1.5rem; line-height: 2rem; }
            .text-neutral-500 { color: #737373; }
            .text-neutral-700 { color: #404040; }
            .text-neutral-900 { color: #171717; }
            .text-emerald-700 { color: #047857; }
            .text-right { text-align: right; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 6px 10px; text-align: left; }
            .rounded-lg { border-radius: 0.5rem; }
            .rounded-xl { border-radius: 0.75rem; }
          </style>
        </head>
        <body>
          <div style="max-width: 800px; margin: 0 auto; padding: 20px;">
            ${html}
          </div>
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 2000);
    }, 400);
  };

  const handleDownloadFile = () => {
    const printSheet = document.getElementById('printable-payslip-sheet');
    if (!printSheet || !payslipData) return;

    let html = printSheet.innerHTML;
    html = html.replace(/\/company-logo-mark\.svg/g, COMPANY_LOGO_DATA_URL);
    html = html.replace(/\/signatures\/hr-signature-clean\.png/g, HR_SIGNATURE_DATA_URL);

    const docNo = payslipData?.verification?.documentNo || 'AZIR-PS';
    const cleanDocNo = docNo.replace(/[^a-zA-Z0-9-]/g, '_');
    const filename = `Payslip_${cleanDocNo}.html`;

    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Official Payslip - ${docNo}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 40px 20px; color: #171717; }
    .page { max-width: 820px; margin: 0 auto; background: #fff; padding: 48px; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); border: 1px solid #e5e5e5; }
    .text-center { text-align: center; }
    .font-bold { font-weight: 700; }
    .font-semibold { font-weight: 600; }
    .uppercase { text-transform: uppercase; }
    .tracking-wider { letter-spacing: 0.05em; }
    .tracking-tight { letter-spacing: -0.025em; }
    .grid { display: grid; }
    .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .flex { display: flex; }
    .items-center { align-items: center; }
    .items-end { align-items: flex-end; }
    .justify-between { justify-content: space-between; }
    .justify-center { justify-content: center; }
    .border { border: 1px solid #e5e5e5; }
    .border-b { border-bottom: 1px solid #e5e5e5; }
    .border-t { border-top: 1px solid #e5e5e5; }
    .bg-neutral-50 { background-color: #fafafa; }
    .p-4 { padding: 1rem; }
    .mb-4 { margin-bottom: 1rem; }
    .mb-6 { margin-bottom: 1.5rem; }
    .mt-4 { margin-top: 1rem; }
    .gap-4 { gap: 1rem; }
    .gap-6 { gap: 1.5rem; }
    .text-xs { font-size: 0.75rem; line-height: 1rem; }
    .text-sm { font-size: 0.875rem; line-height: 1.25rem; }
    .text-base { font-size: 1rem; line-height: 1.5rem; }
    .text-lg { font-size: 1.125rem; line-height: 1.75rem; }
    .text-xl { font-size: 1.25rem; line-height: 1.75rem; }
    .text-2xl { font-size: 1.5rem; line-height: 2rem; }
    .text-neutral-500 { color: #737373; }
    .text-neutral-700 { color: #404040; }
    .text-neutral-900 { color: #171717; }
    .text-emerald-700 { color: #047857; }
    .text-right { text-align: right; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 6px 10px; text-align: left; }
    .rounded-lg { border-radius: 0.5rem; }
    .rounded-xl { border-radius: 0.75rem; }
  </style>
</head>
<body>
  <div class="page">
    ${html}
  </div>
</body>
</html>`;

    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Metrics calculation
  const totalGrossDisbursed = runs.reduce((acc, r) => acc + (Number(r.totalGross) || 0), 0);
  const totalDeductionsRemitted = runs.reduce((acc, r) => acc + (Number(r.totalDeductions) || 0), 0);
  const totalNetDisbursed = runs.reduce((acc, r) => acc + (Number(r.totalNet) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white flex items-center gap-2">
            <Banknote className="w-7 h-7 text-emerald-600" />
            Payroll & Attendance Adjustments
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Philippine statutory computation (SSS, PhilHealth, Pag-IBIG, TRAIN Tax), overtime adjustments, and verified payslips.
          </p>
        </div>

        {isHrOrAdmin && (
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setShowCreatePeriodModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition shadow-sm cursor-pointer"
            >
              <Calendar className="w-4 h-4 text-neutral-500" />
              <span>+ Cutoff Period</span>
            </button>
            <button
              onClick={() => setShowCreateRunModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Initialize Run</span>
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      {isHrOrAdmin && (
        <div className="border-b border-neutral-200 dark:border-neutral-800 flex gap-4">
          <button
            onClick={() => setActiveTab('runs')}
            className={`pb-3 text-sm font-semibold border-b-2 transition cursor-pointer ${
              activeTab === 'runs'
                ? 'border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400'
            }`}
          >
            Payroll Runs ({runs.length})
          </button>
          <button
            onClick={() => setActiveTab('periods')}
            className={`pb-3 text-sm font-semibold border-b-2 transition cursor-pointer ${
              activeTab === 'periods'
                ? 'border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400'
            }`}
          >
            Cutoff Periods ({periods.length})
          </button>
          <button
            onClick={() => setActiveTab('my-payslips')}
            className={`pb-3 text-sm font-semibold border-b-2 transition cursor-pointer ${
              activeTab === 'my-payslips'
                ? 'border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400'
            }`}
          >
            My Payslips ({myPayslips.length})
          </button>
        </div>
      )}

      {/* Executive Metric Cards (for HR) */}
      {isHrOrAdmin && activeTab === 'runs' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-sm">
            <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Total Gross Pay</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold text-neutral-900 dark:text-white">
              ₱{totalGrossDisbursed.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-neutral-500 mt-1">Total earnings before deductions</p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-sm">
            <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Statutory & Taxes</span>
              <ShieldCheck className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold text-neutral-900 dark:text-white">
              ₱{totalDeductionsRemitted.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-neutral-500 mt-1">SSS, PhilHealth, Pag-IBIG & Tax</p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-sm">
            <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Total Net Take-Home</span>
              <Banknote className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              ₱{totalNetDisbursed.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-neutral-500 mt-1">Net disbursements to employee payroll</p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-sm">
            <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Active Employees</span>
              <Users className="w-4 h-4 text-neutral-500" />
            </div>
            <div className="text-2xl font-bold text-neutral-900 dark:text-white">
              {employees.length || 7}
            </div>
            <p className="text-xs text-neutral-500 mt-1">Included in automated calculations</p>
          </div>
        </div>
      )}

      {/* Main Tab Content */}
      {isLoading ? (
        <div className="p-12 text-center text-neutral-500 flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-neutral-400" />
          <span>Loading payroll data...</span>
        </div>
      ) : error ? (
        <div className="p-6 rounded-xl bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-900">
          <div className="font-semibold flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Error loading payroll
          </div>
          <p className="text-sm mt-1">{error}</p>
        </div>
      ) : activeTab === 'runs' && isHrOrAdmin ? (
        /* Runs Table */
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
            <h2 className="font-bold text-neutral-900 dark:text-white text-base">Semi-Monthly Payroll Runs</h2>
            <span className="text-xs text-neutral-500">{runs.length} runs on record</span>
          </div>

          {runs.length === 0 ? (
            <div className="p-12 text-center text-neutral-500">
              <Banknote className="w-10 h-10 mx-auto text-neutral-300 dark:text-neutral-700 mb-2" />
              <p className="font-medium text-neutral-700 dark:text-neutral-300">No payroll runs found</p>
              <p className="text-xs text-neutral-400 mt-1">
                Initialize your first run to start computing semi-monthly salaries.
              </p>
              <button
                onClick={() => setShowCreateRunModal(true)}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 transition"
              >
                <Plus className="w-4 h-4" />
                Initialize Run
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wider border-b border-neutral-200 dark:border-neutral-800">
                  <tr>
                    <th className="py-3 px-4">Run #</th>
                    <th className="py-3 px-4">Cutoff Period</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Total Gross</th>
                    <th className="py-3 px-4 text-right">Total Deductions</th>
                    <th className="py-3 px-4 text-right">Total Net</th>
                    <th className="py-3 px-4">Prepared By</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-neutral-800 dark:text-neutral-200">
                  {runs.map((r) => (
                    <tr key={r.id} className="hover:bg-neutral-50/70 dark:hover:bg-neutral-800/40 transition">
                      <td className="py-3.5 px-4 font-mono font-semibold text-neutral-900 dark:text-white">
                        {r.runNumber}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium">{r.payrollPeriod?.name}</div>
                        <div className="text-xs text-neutral-500">
                          {new Date(r.payrollPeriod?.startDate).toLocaleDateString()} -{' '}
                          {new Date(r.payrollPeriod?.endDate).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            r.status === 'LOCKED' || r.status === 'APPROVED'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : r.status === 'COMPUTED'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300'
                          }`}
                        >
                          {r.status === 'LOCKED' && <Lock className="w-3 h-3" />}
                          {r.status === 'COMPUTED' && <Clock className="w-3 h-3" />}
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-medium">
                        ₱{Number(r.totalGross).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-red-600 dark:text-red-400">
                        ₱{Number(r.totalDeductions).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        ₱{Number(r.totalNet).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-neutral-600 dark:text-neutral-400">
                        {r.preparedBy?.firstName} {r.preparedBy?.lastName}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => loadRunDetail(r.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 hover:bg-neutral-200 transition cursor-pointer"
                        >
                          <span>Manage</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : activeTab === 'periods' && isHrOrAdmin ? (
        /* Periods Table */
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
            <h2 className="font-bold text-neutral-900 dark:text-white text-base">Defined Cutoff Periods</h2>
            <button
              onClick={() => setShowCreatePeriodModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Period</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wider border-b border-neutral-200 dark:border-neutral-800">
                <tr>
                  <th className="py-3 px-4">Period Name</th>
                  <th className="py-3 px-4">Cutoff Type</th>
                  <th className="py-3 px-4">Date Range</th>
                  <th className="py-3 px-4">Pay Date</th>
                  <th className="py-3 px-4 text-center">Working Days</th>
                  <th className="py-3 px-4 text-center">Runs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-neutral-800 dark:text-neutral-200">
                {periods.map((p) => (
                  <tr key={p.id} className="hover:bg-neutral-50/70 dark:hover:bg-neutral-800/40 transition">
                    <td className="py-3.5 px-4 font-semibold text-neutral-900 dark:text-white">
                      {p.name}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300">
                        {p.cutoffType}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-neutral-600 dark:text-neutral-300">
                      {new Date(p.startDate).toLocaleDateString()} &mdash; {new Date(p.endDate).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-medium text-emerald-600 dark:text-emerald-400">
                      {new Date(p.payDate).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono">
                      {p.workingDays} days
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                        {p._count?.payrollRuns || 0}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* My Payslips Table (Employees & HR self-service) */
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-neutral-900 dark:text-white text-base">My Official Payslips</h2>
              <p className="text-xs text-neutral-500">
                Tamper-proof certified payslips with QR code verification and official HR certification.
              </p>
            </div>
            <span className="text-xs text-neutral-500">{myPayslips.length} payslips issued</span>
          </div>

          {myPayslips.length === 0 ? (
            <div className="p-12 text-center text-neutral-500">
              <Banknote className="w-10 h-10 mx-auto text-neutral-300 dark:text-neutral-700 mb-2" />
              <p className="font-medium text-neutral-700 dark:text-neutral-300">No payslips available yet</p>
              <p className="text-xs text-neutral-400 mt-1">
                Your official payslips will be published here once HR approves and locks each payroll cycle.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {myPayslips.map((ps) => (
                <div
                  key={ps.id}
                  className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-neutral-50/70 dark:hover:bg-neutral-800/40 transition"
                >
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-neutral-900 dark:text-white">
                        {ps.periodName}
                      </h3>
                      <div className="flex items-center gap-3 text-xs text-neutral-500 mt-1">
                        <span>Pay Date: {new Date(ps.payDate).toLocaleDateString()}</span>
                        <span>&bull;</span>
                        <span>
                          Cutoff: {new Date(ps.startDate).toLocaleDateString()} &ndash;{' '}
                          {new Date(ps.endDate).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-6">
                    <div className="text-right">
                      <div className="text-xs text-neutral-500">Net Take-Home</div>
                      <div className="font-bold font-mono text-lg text-emerald-600 dark:text-emerald-400">
                        ₱{Number(ps.netPay).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </div>
                    </div>

                    <button
                      onClick={() => openPayslipViewer(ps.id)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition shadow-sm cursor-pointer"
                    >
                      <span>View Official Payslip</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* RUN DETAIL MODAL / DRAWER */}
      {selectedRunId && runDetail && (
        <div
          onClick={() => {
            setSelectedRunId(null);
            setRunDetail(null);
          }}
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-neutral-900 rounded-3xl max-w-5xl w-full border border-neutral-200 dark:border-neutral-800 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          >
            {/* Drawer Header */}
            <div className="p-6 border-b border-neutral-100 dark:border-neutral-800 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white">
                    {runDetail.runNumber}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      runDetail.status === 'LOCKED'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : runDetail.status === 'COMPUTED'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        : 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300'
                    }`}
                  >
                    {runDetail.status === 'LOCKED' && <Lock className="w-3 h-3" />}
                    {runDetail.status}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-neutral-900 dark:text-white mt-1">
                  {runDetail.payrollPeriod?.name}
                </h2>
                <p className="text-xs text-neutral-500">
                  Pay Date: {new Date(runDetail.payrollPeriod?.payDate).toLocaleDateString()} &bull; Prepared by{' '}
                  {runDetail.preparedBy?.firstName} {runDetail.preparedBy?.lastName}
                  {runDetail.approvedBy && ` &bull; Approved by ${runDetail.approvedBy.firstName} ${runDetail.approvedBy.lastName}`}
                </p>
              </div>

              <button
                onClick={() => {
                  setSelectedRunId(null);
                  setRunDetail(null);
                }}
                className="p-2 text-neutral-400 hover:text-neutral-700 dark:hover:text-white rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Run Sub-Tabs & Export Actions */}
            <div className="px-6 pt-3 border-b border-neutral-100 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-50/50 dark:bg-neutral-900/50">
              <div className="flex gap-4">
                <button
                  onClick={() => setDetailSubTab('items')}
                  className={`pb-2.5 text-xs font-semibold border-b-2 transition cursor-pointer ${
                    detailSubTab === 'items'
                      ? 'border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
                      : 'border-transparent text-neutral-500 hover:text-neutral-700'
                  }`}
                >
                  Computed Items ({runDetail.items?.length || 0})
                </button>
                <button
                  onClick={() => setDetailSubTab('adjustments')}
                  className={`pb-2.5 text-xs font-semibold border-b-2 transition cursor-pointer ${
                    detailSubTab === 'adjustments'
                      ? 'border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
                      : 'border-transparent text-neutral-500 hover:text-neutral-700'
                  }`}
                >
                  Attendance Adjustments ({runDetail.adjustments?.length || 0})
                </button>
                <button
                  onClick={() => setDetailSubTab('remittance')}
                  className={`pb-2.5 text-xs font-semibold border-b-2 transition cursor-pointer ${
                    detailSubTab === 'remittance'
                      ? 'border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
                      : 'border-transparent text-neutral-500 hover:text-neutral-700'
                  }`}
                >
                  Statutory Remittance
                </button>
              </div>

              {/* Action buttons: Export CSV & Print Summary */}
              {runDetail.items?.length > 0 && (
                <div className="flex items-center gap-2 pb-2">
                  <button
                    onClick={() => handleExportCsv(runDetail.id, runDetail.runNumber)}
                    disabled={isExportingCsv}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition shadow-xs cursor-pointer disabled:opacity-50"
                    title="Download complete employee payroll register as CSV"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isExportingCsv ? 'Exporting...' : 'Export CSV Register'}</span>
                  </button>

                  <button
                    onClick={() => setShowAccountingSummary(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition shadow-xs cursor-pointer"
                    title="View and print official accounting summary sheet"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Summary Sheet</span>
                  </button>
                </div>
              )}
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1">
              {detailSubTab === 'items' ? (
                <div>
                  {runDetail.items?.length === 0 ? (
                    <div className="p-8 text-center text-neutral-500">
                      <Clock className="w-8 h-8 mx-auto text-neutral-300 dark:text-neutral-700 mb-2" />
                      <p className="font-semibold text-neutral-800 dark:text-neutral-200">Run has not been computed</p>
                      <p className="text-xs text-neutral-400 mt-1">
                        Click "Compute Gross-to-Net" below to run the calculation engine across active employees.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-neutral-50 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 uppercase tracking-wider border-b border-neutral-200 dark:border-neutral-800">
                          <tr>
                            <th className="py-2.5 px-3">Employee</th>
                            <th className="py-2.5 px-3 text-right">Basic (1/2)</th>
                            <th className="py-2.5 px-3 text-right">Allowances</th>
                            <th className="py-2.5 px-3 text-right">Overtime</th>
                            <th className="py-2.5 px-3 text-right">Gross Pay</th>
                            <th className="py-2.5 px-3 text-right">Deductions</th>
                            <th className="py-2.5 px-3 text-right">Net Pay</th>
                            <th className="py-2.5 px-3 text-center">Payslip</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-neutral-800 dark:text-neutral-200 font-mono">
                          {runDetail.items?.map((it) => (
                            <tr key={it.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30">
                              <td className="py-2.5 px-3 font-sans">
                                <div className="font-semibold text-neutral-900 dark:text-white">
                                  {it.employee?.firstName} {it.employee?.lastName}
                                </div>
                                <div className="text-[10px] text-neutral-400 font-mono">
                                  {it.employee?.employeeNo} &bull; {it.employee?.department?.name || 'General'}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                ₱{Number(it.basicPay).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-2.5 px-3 text-right text-neutral-600 dark:text-neutral-400">
                                ₱{Number(it.allowances).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-2.5 px-3 text-right text-emerald-600 dark:text-emerald-400">
                                ₱{Number(it.overtimePay).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold text-neutral-900 dark:text-white">
                                ₱{Number(it.grossPay).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-2.5 px-3 text-right text-red-600 dark:text-red-400">
                                ₱{(Number(it.grossPay) - Number(it.netPay)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                ₱{Number(it.netPay).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-2.5 px-3 text-center font-sans">
                                <button
                                  onClick={() => openPayslipViewer(it.id)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 transition cursor-pointer"
                                >
                                  <FileText className="w-3 h-3 text-neutral-500" />
                                  <span>Preview</span>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : detailSubTab === 'adjustments' ? (
                /* Adjustments Tab */
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-neutral-500">
                      Attendance overtime hours, performance bonuses, or manual deductions before computation.
                    </p>
                    {runDetail.status !== 'LOCKED' && (
                      <button
                        onClick={openAddAdjustmentModal}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 transition cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Adjustment</span>
                      </button>
                    )}
                  </div>

                  {runDetail.adjustments?.length === 0 ? (
                    <div className="p-8 text-center text-neutral-500 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl">
                      <p className="text-xs text-neutral-400">No adjustments added for this cycle.</p>
                    </div>
                  ) : (
                    <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-neutral-50 dark:bg-neutral-800 text-neutral-500 uppercase tracking-wider">
                          <tr>
                            <th className="py-2 px-3">Employee</th>
                            <th className="py-2 px-3">Type</th>
                            <th className="py-2 px-3">Description</th>
                            <th className="py-2 px-3 text-right">Quantity / Hours</th>
                            <th className="py-2 px-3 text-right">Amount (₱)</th>
                            {runDetail.status !== 'LOCKED' && <th className="py-2 px-3 text-center">Action</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 font-mono">
                          {runDetail.adjustments?.map((adj) => (
                            <tr key={adj.id}>
                              <td className="py-2 px-3 font-sans">
                                {adj.employee?.firstName} {adj.employee?.lastName}
                              </td>
                              <td className="py-2 px-3">
                                <span className="font-sans text-[10px] font-semibold px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800">
                                  {adj.type}
                                </span>
                              </td>
                              <td className="py-2 px-3 font-sans text-neutral-600 dark:text-neutral-300">
                                {adj.description}
                              </td>
                              <td className="py-2 px-3 text-right">
                                {adj.quantity !== null && adj.quantity !== undefined ? `${adj.quantity} hrs` : '-'}
                              </td>
                              <td className="py-2 px-3 text-right font-bold text-neutral-900 dark:text-white">
                                ₱{Number(adj.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                              </td>
                              {runDetail.status !== 'LOCKED' && (
                                <td className="py-2 px-3 text-center font-sans">
                                  <button
                                    onClick={() => handleDeleteAdjustment(adj.id)}
                                    className="p-1 text-red-500 hover:text-red-700 transition cursor-pointer"
                                    title="Delete adjustment"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                /* Statutory Remittance Tab */
                <div className="space-y-6">
                  {/* Top Agency Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* SSS */}
                    <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">SSS Contribution</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">RA 11199</span>
                      </div>
                      <div className="text-lg font-bold font-mono text-neutral-900 dark:text-white">
                        ₱{statutoryStats ? statutoryStats.sss.total.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '0.00'}
                      </div>
                      <div className="text-[11px] space-y-0.5 text-neutral-500 font-mono">
                        <div className="flex justify-between">
                          <span>Employee (4.5%):</span>
                          <span>₱{statutoryStats ? statutoryStats.sss.ee.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '0.00'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Employer (9.5%+WISP):</span>
                          <span>₱{statutoryStats ? statutoryStats.sss.er.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '0.00'}</span>
                        </div>
                      </div>
                    </div>

                    {/* PhilHealth */}
                    <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">PhilHealth</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">5.0% Split</span>
                      </div>
                      <div className="text-lg font-bold font-mono text-neutral-900 dark:text-white">
                        ₱{statutoryStats ? statutoryStats.philHealth.total.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '0.00'}
                      </div>
                      <div className="text-[11px] space-y-0.5 text-neutral-500 font-mono">
                        <div className="flex justify-between">
                          <span>Employee (2.5%):</span>
                          <span>₱{statutoryStats ? statutoryStats.philHealth.ee.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '0.00'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Employer (2.5%):</span>
                          <span>₱{statutoryStats ? statutoryStats.philHealth.er.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '0.00'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Pag-IBIG */}
                    <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Pag-IBIG HDMF</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">₱200 Cap</span>
                      </div>
                      <div className="text-lg font-bold font-mono text-neutral-900 dark:text-white">
                        ₱{statutoryStats ? statutoryStats.pagIbig.total.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '0.00'}
                      </div>
                      <div className="text-[11px] space-y-0.5 text-neutral-500 font-mono">
                        <div className="flex justify-between">
                          <span>Employee Share:</span>
                          <span>₱{statutoryStats ? statutoryStats.pagIbig.ee.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '0.00'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Employer Share:</span>
                          <span>₱{statutoryStats ? statutoryStats.pagIbig.er.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '0.00'}</span>
                        </div>
                      </div>
                    </div>

                    {/* BIR Withholding Tax */}
                    <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">BIR Withholding Tax</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">TRAIN Law</span>
                      </div>
                      <div className="text-lg font-bold font-mono text-neutral-900 dark:text-white">
                        ₱{statutoryStats ? statutoryStats.tax.total.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '0.00'}
                      </div>
                      <div className="text-[11px] space-y-0.5 text-neutral-500 font-mono">
                        <div className="flex justify-between">
                          <span>Total Tax Withheld:</span>
                          <span>₱{statutoryStats ? statutoryStats.tax.total.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '0.00'}</span>
                        </div>
                        <div className="flex justify-between text-neutral-400">
                          <span>BIR Form 1601-C:</span>
                          <span>Remittance</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Grand Totals Summary Callout Banner */}
                  <div className="p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-900 text-white dark:bg-neutral-950 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                      <div className="text-xs text-neutral-400 uppercase tracking-wider font-semibold">Net Bank Disbursement</div>
                      <div className="text-2xl font-bold font-mono text-emerald-400 mt-0.5">
                        ₱{statutoryStats ? statutoryStats.net.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '0.00'}
                      </div>
                      <p className="text-[11px] text-neutral-400 mt-1">
                        Total payout funds required for employee bank transfer.
                      </p>
                    </div>

                    <div className="h-10 w-px bg-neutral-800 hidden md:block" />

                    <div>
                      <div className="text-xs text-neutral-400 uppercase tracking-wider font-semibold">Total Employer Burden</div>
                      <div className="text-lg font-bold font-mono text-white mt-0.5">
                        ₱{statutoryStats ? statutoryStats.totalEmployerContributions.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '0.00'}
                      </div>
                      <p className="text-[11px] text-neutral-400 mt-1">
                        Combined SSS ER + PhilHealth ER + Pag-IBIG ER.
                      </p>
                    </div>

                    <div className="h-10 w-px bg-neutral-800 hidden md:block" />

                    <div>
                      <div className="text-xs text-neutral-400 uppercase tracking-wider font-semibold">Total Government Remittance</div>
                      <div className="text-lg font-bold font-mono text-amber-300 mt-0.5">
                        ₱{statutoryStats ? statutoryStats.grandTotalRemittance.toLocaleString('en-PH', { minimumFractionDigits: 2 }) : '0.00'}
                      </div>
                      <p className="text-[11px] text-neutral-400 mt-1">
                        Combined statutory remittances payable to SSS, PHIC, HDMF & BIR.
                      </p>
                    </div>
                  </div>

                  {/* Detailed Statutory Table by Employee */}
                  {runDetail.items?.length > 0 && (
                    <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
                      <div className="p-3 bg-neutral-50 dark:bg-neutral-800/80 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
                        <span className="font-bold text-xs text-neutral-900 dark:text-white">Employee Statutory Remittance Register</span>
                        <span className="text-xs text-neutral-500 font-mono">{runDetail.items.length} employees</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 uppercase tracking-wider border-b border-neutral-200 dark:border-neutral-800">
                            <tr>
                              <th className="py-2 px-3">Employee</th>
                              <th className="py-2 px-3 text-right">SSS (EE)</th>
                              <th className="py-2 px-3 text-right">SSS (ER)</th>
                              <th className="py-2 px-3 text-right">PhilHealth (EE)</th>
                              <th className="py-2 px-3 text-right">PhilHealth (ER)</th>
                              <th className="py-2 px-3 text-right">Pag-IBIG (EE)</th>
                              <th className="py-2 px-3 text-right">Pag-IBIG (ER)</th>
                              <th className="py-2 px-3 text-right">Withholding Tax</th>
                              <th className="py-2 px-3 text-right">Total EE Ded.</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 font-mono text-neutral-800 dark:text-neutral-200">
                            {runDetail.items.map((it) => (
                              <tr key={it.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30">
                                <td className="py-2 px-3 font-sans font-medium text-neutral-900 dark:text-white">
                                  {it.employee.firstName} {it.employee.lastName}
                                  <div className="text-[10px] text-neutral-400 font-mono">{it.employee.employeeNo}</div>
                                </td>
                                <td className="py-2 px-3 text-right">₱{Number(it.sssEe).toFixed(2)}</td>
                                <td className="py-2 px-3 text-right text-neutral-500">₱{Number(it.sssEr).toFixed(2)}</td>
                                <td className="py-2 px-3 text-right">₱{Number(it.philHealthEe).toFixed(2)}</td>
                                <td className="py-2 px-3 text-right text-neutral-500">₱{Number(it.philHealthEr).toFixed(2)}</td>
                                <td className="py-2 px-3 text-right">₱{Number(it.pagIbigEe).toFixed(2)}</td>
                                <td className="py-2 px-3 text-right text-neutral-500">₱{Number(it.pagIbigEr).toFixed(2)}</td>
                                <td className="py-2 px-3 text-right font-semibold text-neutral-900 dark:text-white">
                                  ₱{Number(it.withholdingTax).toFixed(2)}
                                </td>
                                <td className="py-2 px-3 text-right font-semibold text-rose-600 dark:text-rose-400">
                                  ₱{(Number(it.grossPay) - Number(it.netPay)).toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Drawer Actions Footer */}
            <div className="p-4 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/60 dark:bg-neutral-900/60">
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                {runDetail.status === 'LOCKED' ? (
                  <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                    <CheckCircle className="w-4 h-4" />
                    Locked & Official Payslips Issued
                  </span>
                ) : (
                  <span>Edit adjustments and compute when ready.</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {runDetail.status !== 'LOCKED' && (
                  <button
                    onClick={() => handleComputeRun(runDetail.id)}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 transition shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSubmitting ? 'animate-spin' : ''}`} />
                    <span>{runDetail.status === 'COMPUTED' ? 'Re-compute Run' : 'Compute Gross-to-Net'}</span>
                  </button>
                )}

                {runDetail.status === 'COMPUTED' && can('payroll.approve') && (
                  <>
                    <button
                      onClick={() => handleDecideRun(runDetail.id, 'REJECT')}
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer"
                    >
                      <span>Return to Draft</span>
                    </button>
                    <button
                      onClick={() => handleDecideRun(runDetail.id, 'APPROVE')}
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Approve & Issue Payslips</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE PERIOD MODAL */}
      {showCreatePeriodModal && (
        <div
          onClick={() => setShowCreatePeriodModal(false)}
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-neutral-900 rounded-3xl max-w-md w-full p-6 border border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-neutral-900 dark:text-white">Add Cutoff Period</h3>
              <button
                onClick={() => setShowCreatePeriodModal(false)}
                className="p-1 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePeriod} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Period Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. November 2026 - Second Half"
                  value={newPeriodName}
                  onChange={(e) => setNewPeriodName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white transition"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Cutoff Type
                </label>
                <select
                  value={newPeriodType}
                  onChange={(e) => setNewPeriodType(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white transition"
                >
                  <option value="FIRST_HALF" className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 py-1">First Half (1st &ndash; 15th)</option>
                  <option value="SECOND_HALF" className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 py-1">Second Half (16th &ndash; End)</option>
                  <option value="MONTHLY" className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 py-1">Full Month</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={newPeriodStartDate}
                    onChange={(e) => setNewPeriodStartDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 [color-scheme:light] dark:[color-scheme:dark] shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white transition"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    required
                    value={newPeriodEndDate}
                    onChange={(e) => setNewPeriodEndDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 [color-scheme:light] dark:[color-scheme:dark] shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Pay Date
                  </label>
                  <input
                    type="date"
                    required
                    value={newPeriodPayDate}
                    onChange={(e) => setNewPeriodPayDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 [color-scheme:light] dark:[color-scheme:dark] shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white transition"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Working Days
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    required
                    value={newPeriodWorkingDays}
                    onChange={(e) => setNewPeriodWorkingDays(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white transition"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreatePeriodModal(false)}
                  className="px-4 py-2 rounded-xl text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-semibold transition cursor-pointer disabled:opacity-50"
                >
                  Create Period
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE RUN MODAL */}
      {showCreateRunModal && (
        <div
          onClick={() => setShowCreateRunModal(false)}
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-neutral-900 rounded-3xl max-w-md w-full p-6 border border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-neutral-900 dark:text-white">Initialize Payroll Run</h3>
              <button
                onClick={() => setShowCreateRunModal(false)}
                className="p-1 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRun} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Select Cutoff Period
                </label>
                <select
                  required
                  value={selectedPeriodId}
                  onChange={(e) => {
                    setSelectedPeriodId(e.target.value);
                    const chosen = periods.find((p) => p.id === e.target.value);
                    if (chosen) {
                      const yr = new Date(chosen.startDate).getFullYear();
                      const mo = String(new Date(chosen.startDate).getMonth() + 1).padStart(2, '0');
                      const half = chosen.cutoffType === 'FIRST_HALF' ? '1' : '2';
                      setNewRunNumber(`PR-${yr}-${mo}-${half}`);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white transition"
                >
                  <option value="" className="bg-white dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400">
                    -- Choose Cutoff Period --
                  </option>
                  {periods.map((p) => (
                    <option
                      key={p.id}
                      value={p.id}
                      className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 py-1"
                    >
                      {p.name} ({new Date(p.startDate).toLocaleDateString()} &ndash; {new Date(p.endDate).toLocaleDateString()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Run Identifier
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. PR-2026-11-1"
                  value={newRunNumber}
                  onChange={(e) => setNewRunNumber(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 font-mono shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white transition"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateRunModal(false)}
                  className="px-4 py-2 rounded-xl text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-semibold transition cursor-pointer disabled:opacity-50"
                >
                  Initialize Run
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD ADJUSTMENT MODAL */}
      {showAddAdjustmentModal && (
        <div
          onClick={() => setShowAddAdjustmentModal(false)}
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-neutral-900 rounded-3xl max-w-md w-full p-6 border border-neutral-200 dark:border-neutral-800 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-neutral-900 dark:text-white">Add Payroll Adjustment</h3>
              <button
                onClick={() => setShowAddAdjustmentModal(false)}
                className="p-1 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddAdjustment} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Employee
                </label>
                <select
                  required
                  value={adjEmployeeId}
                  onChange={(e) => setAdjEmployeeId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white transition"
                >
                  <option value="" className="bg-white dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400">
                    -- Select Employee --
                  </option>
                  {(Array.isArray(employees) && employees.length > 0
                    ? employees
                    : runDetail?.items?.map((it) => it.employee) || []
                  ).map((emp) => (
                    <option
                      key={emp.id}
                      value={emp.id}
                      className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 py-1"
                    >
                      {emp.firstName} {emp.lastName} ({emp.employeeNo}) &ndash; {emp.position}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Adjustment Type
                </label>
                <select
                  value={adjType}
                  onChange={(e) => setAdjType(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white transition"
                >
                  <option value="OVERTIME_HOURS" className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 py-1">
                    Overtime (Hours &times; 1.25x hourly rate)
                  </option>
                  <option value="BONUS" className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 py-1">
                    Performance / Milestone Bonus (₱)
                  </option>
                  <option value="ALLOWANCE" className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 py-1">
                    Additional Allowance (₱)
                  </option>
                  <option value="DEDUCTION" className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 py-1">
                    Manual Salary Deduction (₱)
                  </option>
                </select>
              </div>

              {adjType === 'OVERTIME_HOURS' ? (
                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Overtime Hours
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    required
                    value={adjQuantity}
                    onChange={(e) => setAdjQuantity(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 font-mono shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white transition"
                  />
                  <p className="text-[11px] text-neutral-400 mt-1">
                    System automatically derives the hourly rate from monthly base salary and applies the 1.25x DOLE multiplier.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Amount (₱)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    required
                    value={adjAmount}
                    onChange={(e) => setAdjAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 font-mono shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white transition"
                  />
                </div>
              )}

              <div>
                <label className="block font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Reason / Description
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Q4 Sprint deployment OT"
                  value={adjDescription}
                  onChange={(e) => setAdjDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white transition"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddAdjustmentModal(false)}
                  className="px-4 py-2 rounded-xl text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-semibold transition cursor-pointer disabled:opacity-50"
                >
                  Save Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ACCOUNTING SUMMARY PRINT MODAL */}
      {showAccountingSummary && runDetail && statutoryStats && (
        <div
          onClick={() => setShowAccountingSummary(false)}
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white text-neutral-900 rounded-3xl max-w-4xl w-full border border-neutral-300 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
          >
            {/* Top Toolbar */}
            <div className="p-4 bg-neutral-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-sm">Official Accounting Summary Sheet</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintAccountingSummary}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white text-neutral-900 hover:bg-neutral-100 transition shadow-sm cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print / Save PDF</span>
                </button>
                <button
                  onClick={() => setShowAccountingSummary(false)}
                  className="p-1.5 text-neutral-400 hover:text-white rounded-full hover:bg-neutral-800 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Printable Body */}
            <div className="p-8 overflow-y-auto bg-neutral-100 flex justify-center">
              <div
                id="printable-accounting-sheet"
                className="bg-white p-8 max-w-3xl w-full shadow-lg border border-neutral-200 text-neutral-900 font-sans"
                style={{ minHeight: '800px' }}
              >
                {/* Header */}
                <div className="text-center pb-4 border-b-2 border-neutral-900 mb-6">
                  <div className="flex justify-center mb-2">
                    <img
                      src="/logos/azir-company-logo.png"
                      alt="Azir Company Logo"
                      style={{ height: '48px', width: 'auto' }}
                    />
                  </div>
                  <h1 className="text-xl font-bold uppercase tracking-wider text-neutral-900">
                    Azir Technologies Corporation
                  </h1>
                  <p className="text-xs text-neutral-500">
                    BGC Corporate Center, Taguig City, Metro Manila, Philippines
                  </p>
                  <div className="mt-3 inline-block px-4 py-1 bg-neutral-900 text-white text-xs font-bold uppercase tracking-widest rounded-full">
                    Official Payroll Register & Statutory Remittance Summary
                  </div>
                </div>

                {/* Period & Run Metadata */}
                <div className="grid grid-cols-2 gap-4 text-xs mb-6 p-4 bg-neutral-50 border border-neutral-200 rounded-lg">
                  <div>
                    <div className="text-neutral-500">Payroll Run Number:</div>
                    <div className="font-bold font-mono text-sm text-neutral-900">{runDetail.runNumber}</div>
                    <div className="text-neutral-500 mt-2">Payroll Period:</div>
                    <div className="font-semibold text-neutral-900">{runDetail.payrollPeriod?.name}</div>
                  </div>
                  <div>
                    <div className="text-neutral-500">Cutoff Dates:</div>
                    <div className="font-semibold text-neutral-900">
                      {new Date(runDetail.payrollPeriod?.startDate).toLocaleDateString()} &ndash;{' '}
                      {new Date(runDetail.payrollPeriod?.endDate).toLocaleDateString()}
                    </div>
                    <div className="text-neutral-500 mt-2">Payout Date:</div>
                    <div className="font-bold text-neutral-900">
                      {new Date(runDetail.payrollPeriod?.payDate).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                {/* Section 1: Disbursement Totals */}
                <div className="mb-6">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-700 pb-1 border-b border-neutral-300 mb-2">
                    1. Payroll Disbursement Reconciliation
                  </h2>
                  <table className="w-full text-xs">
                    <tbody>
                      <tr className="border-b border-neutral-200">
                        <td className="py-2">Total Gross Earnings</td>
                        <td className="py-2 text-right font-mono font-semibold">
                          ₱{statutoryStats.gross.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                      <tr className="border-b border-neutral-200">
                        <td className="py-2">Less: Total Employee Deductions</td>
                        <td className="py-2 text-right font-mono font-semibold text-rose-600">
                          (₱{statutoryStats.deductions.toLocaleString('en-PH', { minimumFractionDigits: 2 })})
                        </td>
                      </tr>
                      <tr className="bg-neutral-100 font-bold">
                        <td className="py-2.5 px-2">Net Pay for Bank Disbursement</td>
                        <td className="py-2.5 px-2 text-right font-mono text-emerald-700 text-sm">
                          ₱{statutoryStats.net.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Section 2: Statutory Liabilities */}
                <div className="mb-8">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-700 pb-1 border-b border-neutral-300 mb-2">
                    2. Philippine Statutory Remittances (Government Liabilities)
                  </h2>
                  <table className="w-full text-xs border border-neutral-300">
                    <thead className="bg-neutral-100 font-bold border-b border-neutral-300">
                      <tr>
                        <th className="py-2 px-2 text-left">Agency / Statutory Scheme</th>
                        <th className="py-2 px-2 text-right">Employee (EE)</th>
                        <th className="py-2 px-2 text-right">Employer (ER)</th>
                        <th className="py-2 px-2 text-right">Total Payable</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 font-mono">
                      <tr>
                        <td className="py-2 px-2 font-sans font-medium">Social Security System (SSS & WISP)</td>
                        <td className="py-2 px-2 text-right">₱{statutoryStats.sss.ee.toFixed(2)}</td>
                        <td className="py-2 px-2 text-right">₱{statutoryStats.sss.er.toFixed(2)}</td>
                        <td className="py-2 px-2 text-right font-bold">₱{statutoryStats.sss.total.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-2 font-sans font-medium">Philippine Health Insurance (PhilHealth)</td>
                        <td className="py-2 px-2 text-right">₱{statutoryStats.philHealth.ee.toFixed(2)}</td>
                        <td className="py-2 px-2 text-right">₱{statutoryStats.philHealth.er.toFixed(2)}</td>
                        <td className="py-2 px-2 text-right font-bold">₱{statutoryStats.philHealth.total.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-2 font-sans font-medium">Pag-IBIG Fund (HDMF)</td>
                        <td className="py-2 px-2 text-right">₱{statutoryStats.pagIbig.ee.toFixed(2)}</td>
                        <td className="py-2 px-2 text-right">₱{statutoryStats.pagIbig.er.toFixed(2)}</td>
                        <td className="py-2 px-2 text-right font-bold">₱{statutoryStats.pagIbig.total.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-2 font-sans font-medium">Bureau of Internal Revenue (Withholding Tax)</td>
                        <td className="py-2 px-2 text-right">₱{statutoryStats.tax.total.toFixed(2)}</td>
                        <td className="py-2 px-2 text-right text-neutral-400">&mdash;</td>
                        <td className="py-2 px-2 text-right font-bold">₱{statutoryStats.tax.total.toFixed(2)}</td>
                      </tr>
                      <tr className="bg-neutral-100 font-bold border-t-2 border-neutral-900 font-mono">
                        <td className="py-2.5 px-2 font-sans">TOTAL STATUTORY REMITTANCE</td>
                        <td className="py-2.5 px-2 text-right">₱{statutoryStats.totalEmployeeStatutory.toFixed(2)}</td>
                        <td className="py-2.5 px-2 text-right">₱{statutoryStats.totalEmployerContributions.toFixed(2)}</td>
                        <td className="py-2.5 px-2 text-right text-sm text-neutral-900">
                          ₱{statutoryStats.grandTotalRemittance.toFixed(2)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Section 3: Signatures */}
                <div className="pt-6 border-t border-neutral-300 grid grid-cols-2 gap-8 text-xs">
                  <div>
                    <div className="text-neutral-500 mb-8">Prepared By:</div>
                    <div className="border-t border-neutral-900 pt-1 font-bold text-neutral-900">
                      {runDetail.preparedBy?.firstName} {runDetail.preparedBy?.lastName}
                    </div>
                    <div className="text-[10px] text-neutral-500">
                      Payroll Specialist ({runDetail.preparedBy?.employeeNo})
                    </div>
                  </div>

                  <div>
                    <div className="text-neutral-500 mb-8">Approved & Certified By:</div>
                    <div className="border-t border-neutral-900 pt-1 font-bold text-neutral-900">
                      {runDetail.approvedBy
                        ? `${runDetail.approvedBy.firstName} ${runDetail.approvedBy.lastName}`
                        : '___________________________'}
                    </div>
                    <div className="text-[10px] text-neutral-500">
                      {runDetail.approvedBy
                        ? `Authorizing Officer (${runDetail.approvedBy.employeeNo})`
                        : 'Authorizing Officer (Pending Approval)'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OFFICIAL PAYSLIP SHEET VIEWER MODAL */}
      {viewingPayslipId && (
        <div
          onClick={closePayslipViewer}
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-6 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative bg-white dark:bg-neutral-900 rounded-3xl max-w-3xl w-full border border-neutral-200 dark:border-neutral-800 shadow-2xl flex flex-col max-h-[95vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          >
            {/* Top Toolbar */}
            <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/80 dark:bg-neutral-900/80">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <span className="font-bold text-sm text-neutral-900 dark:text-white">
                  Official Certified Payslip
                </span>
                {payslipData?.verification?.documentNo && (
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200">
                    {payslipData.verification.documentNo}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadFile}
                  disabled={isLoadingPayslip || !payslipData}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100 transition shadow-sm cursor-pointer disabled:opacity-50"
                  title="Save standalone offline file"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Save File</span>
                </button>
                <button
                  onClick={handlePrintPayslip}
                  disabled={isLoadingPayslip || !payslipData}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition shadow-sm cursor-pointer disabled:opacity-50"
                  title="Print or Save as PDF"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print / Save PDF</span>
                </button>
                <button
                  onClick={closePayslipViewer}
                  className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-white rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Sheet Viewport */}
            <div className="p-6 overflow-y-auto flex-1 bg-neutral-100 dark:bg-neutral-950/60">
              {isLoadingPayslip ? (
                <div className="p-16 text-center text-neutral-500 flex flex-col items-center justify-center gap-3">
                  <RefreshCw className="w-8 h-8 animate-spin text-neutral-400" />
                  <span>Loading payslip...</span>
                </div>
              ) : payslipData ? (
                <div
                  id="printable-payslip-sheet"
                  className="bg-white text-neutral-900 rounded-2xl p-8 sm:p-10 shadow-lg border border-neutral-200 mx-auto max-w-2xl font-sans"
                >
                  {/* Header */}
                  <div className="text-center pb-6 border-b border-neutral-200">
                    <div className="flex justify-center mb-2">
                      <img
                        src="/company-logo-mark.svg"
                        alt="Company Logo"
                        className="h-10 w-auto object-contain"
                        style={{ display: 'block', margin: '0 auto', height: '40px' }}
                      />
                    </div>
                    <div className="font-bold text-lg tracking-tight uppercase">Azir Company Global Tech</div>
                    <div className="text-xs text-neutral-500">
                      BGC Corporate Center, Taguig City, Metro Manila, Philippines
                    </div>
                    <div className="mt-3 inline-block px-3 py-1 rounded bg-neutral-100 font-bold text-xs uppercase tracking-wider text-neutral-800">
                      Official Semi-Monthly Employee Payslip
                    </div>
                  </div>

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 gap-4 py-4 text-xs border-b border-neutral-200">
                    <div className="space-y-1">
                      <div>
                        <span className="text-neutral-500">Employee:</span>{' '}
                        <strong className="text-neutral-900">
                          {payslipData.employee?.firstName} {payslipData.employee?.lastName}
                        </strong>
                      </div>
                      <div>
                        <span className="text-neutral-500">Employee ID:</span>{' '}
                        <span className="font-mono">{payslipData.employee?.employeeNo}</span>
                      </div>
                      <div>
                        <span className="text-neutral-500">Department:</span>{' '}
                        <span>{payslipData.employee?.department}</span>
                      </div>
                      <div>
                        <span className="text-neutral-500">Position:</span>{' '}
                        <span>{payslipData.employee?.position}</span>
                      </div>
                    </div>

                    <div className="space-y-1 text-right">
                      <div>
                        <span className="text-neutral-500">Document No:</span>{' '}
                        <strong className="font-mono text-neutral-900">
                          {payslipData.verification?.documentNo}
                        </strong>
                      </div>
                      <div>
                        <span className="text-neutral-500">Cutoff:</span>{' '}
                        <span>{payslipData.period?.name}</span>
                      </div>
                      <div>
                        <span className="text-neutral-500">Pay Date:</span>{' '}
                        <strong>
                          {new Date(payslipData.period?.payDate).toLocaleDateString()}
                        </strong>
                      </div>
                      <div>
                        <span className="text-neutral-500">Working Days:</span>{' '}
                        <span>{payslipData.period?.workingDays} days</span>
                      </div>
                    </div>
                  </div>

                  {/* Earnings & Deductions Tables */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-6 border-b border-neutral-200 text-xs">
                    {/* Earnings */}
                    <div>
                      <div className="font-bold text-xs uppercase tracking-wider text-neutral-700 mb-2 pb-1 border-b border-neutral-200">
                        Earnings (₱)
                      </div>
                      <table className="w-full">
                        <tbody className="divide-y divide-neutral-100 font-mono">
                          <tr>
                            <td className="py-1 text-neutral-700">Basic Pay</td>
                            <td className="py-1 text-right font-medium">
                              ₱{Number(payslipData.payrollItem?.basicPay).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                          {Number(payslipData.payrollItem?.allowances) > 0 && (
                            <tr>
                              <td className="py-1 text-neutral-700">Allowances</td>
                              <td className="py-1 text-right font-medium">
                                ₱{Number(payslipData.payrollItem?.allowances).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          )}
                          {Number(payslipData.payrollItem?.overtimePay) > 0 && (
                            <tr>
                              <td className="py-1 text-neutral-700">Overtime Pay</td>
                              <td className="py-1 text-right font-medium text-emerald-600">
                                ₱{Number(payslipData.payrollItem?.overtimePay).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-neutral-300 font-bold">
                            <td className="pt-2">Gross Pay</td>
                            <td className="pt-2 text-right">
                              ₱{Number(payslipData.payrollItem?.grossPay).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Deductions */}
                    <div>
                      <div className="font-bold text-xs uppercase tracking-wider text-neutral-700 mb-2 pb-1 border-b border-neutral-200">
                        Deductions & Taxes (₱)
                      </div>
                      <table className="w-full">
                        <tbody className="divide-y divide-neutral-100 font-mono">
                          {Number(payslipData.payrollItem?.absencesDeduction) > 0 && (
                            <tr>
                              <td className="py-1 text-neutral-700">Unpaid Absences</td>
                              <td className="py-1 text-right font-medium text-red-600">
                                ₱{Number(payslipData.payrollItem?.absencesDeduction).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          )}
                          <tr>
                            <td className="py-1 text-neutral-700">SSS EE</td>
                            <td className="py-1 text-right font-medium">
                              ₱{Number(payslipData.payrollItem?.sssEe).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                          <tr>
                            <td className="py-1 text-neutral-700">PhilHealth EE</td>
                            <td className="py-1 text-right font-medium">
                              ₱{Number(payslipData.payrollItem?.philHealthEe).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                          <tr>
                            <td className="py-1 text-neutral-700">Pag-IBIG EE</td>
                            <td className="py-1 text-right font-medium">
                              ₱{Number(payslipData.payrollItem?.pagIbigEe).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                          <tr>
                            <td className="py-1 text-neutral-700">Withholding Tax (TRAIN)</td>
                            <td className="py-1 text-right font-medium">
                              ₱{Number(payslipData.payrollItem?.withholdingTax).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                          {Number(payslipData.payrollItem?.otherDeductions) > 0 && (
                            <tr>
                              <td className="py-1 text-neutral-700">Other Deductions</td>
                              <td className="py-1 text-right font-medium">
                                ₱{Number(payslipData.payrollItem?.otherDeductions).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-neutral-300 font-bold text-red-600">
                            <td className="pt-2">Total Deductions</td>
                            <td className="pt-2 text-right">
                              ₱{(Number(payslipData.payrollItem?.grossPay) - Number(payslipData.payrollItem?.netPay)).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* Net Pay Callout */}
                  <div className="my-6 p-4 rounded-xl bg-neutral-900 text-white flex items-center justify-between">
                    <div>
                      <div className="text-xs uppercase tracking-wider text-neutral-400 font-medium">
                        Net Take-Home Pay
                      </div>
                      <div className="text-xs text-neutral-300">
                        Disbursed to employee payroll account
                      </div>
                    </div>
                    <div className="text-2xl font-bold font-mono text-emerald-400">
                      ₱{Number(payslipData.payrollItem?.netPay).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  {/* Employer Statutory Contributions */}
                  <div className="p-3 rounded-lg bg-neutral-50 text-[11px] text-neutral-600 mb-6">
                    <span className="font-semibold text-neutral-800">Employer Statutory Remittance:</span>{' '}
                    SSS ER: ₱{Number(payslipData.payrollItem?.sssEr).toFixed(2)} &bull; PhilHealth ER: ₱{Number(payslipData.payrollItem?.philHealthEr).toFixed(2)} &bull; Pag-IBIG ER: ₱{Number(payslipData.payrollItem?.pagIbigEr).toFixed(2)}
                  </div>

                  {/* Signatures & Verification Section */}
                  <div className="pt-6 flex items-end justify-between border-t border-neutral-200">
                    <div className="space-y-1 relative">
                      <div className="font-bold text-xs uppercase tracking-wider text-neutral-900">
                        Certified Correct:
                      </div>

                      {/* Transparent Official HR Signature */}
                      <div className="h-14 -mb-3 flex items-end pl-2">
                        <img
                          src="/signatures/hr-signature-clean.png"
                          alt="HR Official E-Signature"
                          className="hr-sig-img object-contain pointer-events-none select-none"
                          style={{ height: '56px', maxHeight: '56px', width: 'auto', display: 'block' }}
                        />
                      </div>

                      <div className="pt-3 border-t border-neutral-900 min-w-[200px]">
                        <div className="font-bold text-xs text-neutral-900">
                          {payslipData.approver?.firstName || 'Maria'} {payslipData.approver?.lastName || 'Clara'}
                        </div>
                        <div className="text-[10px] text-neutral-500">
                          {payslipData.approver?.position || 'Human Resources Lead'} &bull; Azir Company
                        </div>
                      </div>
                    </div>

                    {/* QR Code */}
                    <div className="flex flex-col items-center text-center">
                      {qrCodeDataUrl ? (
                        <img
                          src={qrCodeDataUrl}
                          alt="Verification QR Code"
                          className="w-20 h-20 border border-neutral-200 rounded p-1 mb-1"
                        />
                      ) : (
                        <div className="w-20 h-20 border border-dashed border-neutral-300 rounded flex items-center justify-center text-[10px] text-neutral-400 mb-1">
                          No QR
                        </div>
                      )}
                      <div className="text-[9px] font-mono font-semibold text-neutral-600">
                        {payslipData.verification?.verificationCode}
                      </div>
                      <div className="text-[8px] text-neutral-400 max-w-[140px] leading-tight mt-0.5">
                        Scan to verify official payroll issuance
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PayrollPage() {
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center">
          <div className="w-8 h-8 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm font-medium text-neutral-500">Loading payroll...</p>
        </div>
      }
    >
      <PayrollContent />
    </Suspense>
  );
}
