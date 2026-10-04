import { useEffect, useMemo, useState } from 'react';

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const todayLocal = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

const emptyForm = () => ({
  employee_id: '',
  ot_date: todayLocal(),
  start_time: '18:00',
  end_time: '20:00',
  note: '',
});

export default function OtForm({ webApp }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const bossId = webApp.initDataUnsafe?.user?.id;

  const notify = (message, onClose) => {
    if (typeof webApp.showAlert === 'function') {
      webApp.showAlert(message, onClose);
    } else {
      window.alert(message);
      onClose?.();
    }
  };

  const headers = useMemo(
    () => ({
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': webApp.initData,
    }),
    [webApp.initData]
  );

  // Load employees for the dropdown
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/employees`, { headers });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || 'Failed to load employees');
        if (!cancelled) setEmployees(data.employees || []);
      } catch (err) {
        if (!cancelled) notify(`Error: ${err.message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headers]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    // Client-side validation
    if (!form.employee_id) return notify('Please select an employee.');
    if (!form.ot_date) return notify('Please choose a date.');
    if (!form.start_time || !form.end_time) return notify('Please set start and end times.');
    if (form.end_time <= form.start_time) return notify('End time must be after start time.');

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/assign-ot`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          boss_id: bossId,
          employee_id: Number(form.employee_id),
          ot_date: form.ot_date,
          start_time: form.start_time,
          end_time: form.end_time,
          note: form.note.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to assign OT');
      }

      webApp.HapticFeedback?.notificationOccurred('success');
      const warnings = data.warnings?.length ? `\n\n⚠️ ${data.warnings.join('\n⚠️ ')}` : '';
      notify(`✅ OT assigned successfully.${warnings}`);
      setForm(emptyForm());
    } catch (err) {
      webApp.HapticFeedback?.notificationOccurred('error');
      notify(`❌ ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-black/10 bg-tg-secondary px-3 py-2.5 text-base text-tg-text ' +
    'outline-none focus:border-tg-button focus:ring-2 focus:ring-tg-button/30 disabled:opacity-60';
  const labelClass = 'mb-1 block text-sm font-medium';

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl bg-tg-bg p-4 shadow-sm">
      <div>
        <label htmlFor="employee_id" className={labelClass}>
          Employee
        </label>
        <select
          id="employee_id"
          name="employee_id"
          value={form.employee_id}
          onChange={handleChange}
          disabled={loading || submitting}
          className={inputClass}
        >
          <option value="">{loading ? 'Loading…' : 'Select employee'}</option>
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.name}
              {emp.department ? ` — ${emp.department}` : ''}
            </option>
          ))}
        </select>
        {!loading && employees.length === 0 && (
          <p className="mt-1 text-xs text-tg-hint">No employees found. Add them to the database first.</p>
        )}
      </div>

      <div>
        <label htmlFor="ot_date" className={labelClass}>
          Date
        </label>
        <input
          id="ot_date"
          type="date"
          name="ot_date"
          value={form.ot_date}
          onChange={handleChange}
          disabled={submitting}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="start_time" className={labelClass}>
            Start time
          </label>
          <input
            id="start_time"
            type="time"
            name="start_time"
            value={form.start_time}
            onChange={handleChange}
            disabled={submitting}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="end_time" className={labelClass}>
            End time
          </label>
          <input
            id="end_time"
            type="time"
            name="end_time"
            value={form.end_time}
            onChange={handleChange}
            disabled={submitting}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor="note" className={labelClass}>
          Note <span className="font-normal text-tg-hint">(optional)</span>
        </label>
        <textarea
          id="note"
          name="note"
          rows={3}
          maxLength={500}
          value={form.note}
          onChange={handleChange}
          disabled={submitting}
          placeholder="e.g. Finish the month-end report"
          className={inputClass}
        />
        <p className="mt-1 text-right text-xs text-tg-hint">{form.note.length}/500</p>
      </div>

      <button
        type="submit"
        disabled={submitting || loading}
        className="w-full rounded-xl bg-tg-button px-4 py-3 text-base font-semibold text-tg-button-text
                   transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Assigning…' : 'Assign OT'}
      </button>
    </form>
  );
}