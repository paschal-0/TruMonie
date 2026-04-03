'use client';

import { FormEvent, useEffect, useState } from 'react';

import { apiGet, apiPost } from '@/lib/api';
import { getStoredToken } from '@/lib/auth';
import { ApiErrorShape } from '@/lib/types';

interface SubmissionRow {
  id: string;
  submission_type: string;
  report_type: string | null;
  period: string | null;
  slsg_reference: string | null;
  status: string;
  status_message: string | null;
  submitted_at: string | null;
}

export default function SlsgPage() {
  const [items, setItems] = useState<SubmissionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reportType, setReportType] = useState('MMFBR_300');
  const [period, setPeriod] = useState('');
  const [dataJson, setDataJson] = useState('{}');
  const [genericPayload, setGenericPayload] = useState('{}');

  const load = async () => {
    const token = getStoredToken();
    if (!token) return;
    setError(null);
    try {
      setItems(await apiGet<SubmissionRow[]>('/admin/slsg/submissions', token));
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || 'Failed to load SLSG submissions');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submitReturn = async (event: FormEvent) => {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) return;
    setError(null);
    setNotice(null);
    try {
      await apiPost(
        '/admin/slsg/returns/submit',
        {
          report_type: reportType,
          period,
          data: JSON.parse(dataJson)
        },
        token
      );
      setNotice('Return submitted to SLSG');
      await load();
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || 'Failed to submit return');
    }
  };

  const submitGeneric = async (
    endpoint:
      | '/admin/slsg/licenses/renew'
      | '/admin/slsg/incidents/report'
      | '/admin/slsg/attestations/submit',
    successMessage: string
  ) => {
    const token = getStoredToken();
    if (!token) return;
    setError(null);
    setNotice(null);
    try {
      await apiPost(
        endpoint,
        {
          payload: JSON.parse(genericPayload)
        },
        token
      );
      setNotice(successMessage);
      await load();
    } catch (err) {
      const shaped = err as ApiErrorShape;
      setError(shaped.message || 'Failed to submit to SLSG');
    }
  };

  return (
    <>
      <div className="topbar">
        <h1>SLSG Integration</h1>
        <button className="secondary" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      <form className="card" onSubmit={submitReturn}>
        <h3>Submit Periodic Return</h3>
        <div className="row-actions">
          <input value={reportType} onChange={(e) => setReportType(e.target.value)} required />
          <input
            placeholder="Period (YYYY-MM)"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            required
          />
        </div>
        <div className="form-row">
          <label>Payload JSON</label>
          <textarea rows={4} value={dataJson} onChange={(e) => setDataJson(e.target.value)} />
        </div>
        <button type="submit">Submit Return</button>
      </form>

      <div className="card">
        <h3>Other SLSG Submissions</h3>
        <div className="form-row">
          <label>Payload JSON</label>
          <textarea rows={4} value={genericPayload} onChange={(e) => setGenericPayload(e.target.value)} />
        </div>
        <div className="row-actions">
          <button
            className="secondary"
            onClick={() => void submitGeneric('/admin/slsg/licenses/renew', 'License renewal submitted')}
          >
            Submit License Renewal
          </button>
          <button
            className="secondary"
            onClick={() => void submitGeneric('/admin/slsg/incidents/report', 'Incident report submitted')}
          >
            Submit Incident
          </button>
          <button
            className="secondary"
            onClick={() =>
              void submitGeneric('/admin/slsg/attestations/submit', 'Compliance attestation submitted')
            }
          >
            Submit Attestation
          </button>
        </div>
      </div>

      {notice ? <div className="card success">{notice}</div> : null}
      {error ? <div className="card error">{error}</div> : null}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Report Type</th>
              <th>Period</th>
              <th>Status</th>
              <th>SLSG Ref</th>
              <th>Submitted At</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.submission_type}</td>
                <td>{item.report_type ?? '-'}</td>
                <td>{item.period ?? '-'}</td>
                <td>{item.status}</td>
                <td>{item.slsg_reference ?? '-'}</td>
                <td>{item.submitted_at ? new Date(item.submitted_at).toLocaleString() : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
