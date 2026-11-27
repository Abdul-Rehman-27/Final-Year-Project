import { useEffect } from "react";
import Card from "../common/Card.jsx";
import Button from "../common/Button.jsx";
import Select from "../common/Select.jsx";
import Textarea from "../common/Textarea.jsx";
import { fill } from "../../utils/format.js";

export default function LabRequestForm({ t, patientSelect, patients, tests, patient, setPatient, test, setTest, notes, setNotes, linked, onSubmit, onCancel, submitting }) {
  const chosen = tests.find((item) => String(item.id) === String(test));
  return <Card className="min-w-0 space-y-4 p-5">
    <div><h2 className="text-xl font-black">{t("doctor.lab.request")}</h2><p className="mt-1 text-ink-muted">{t("doctor.lab.formHelp")}</p></div>
    <Select ref={patientSelect} id="lab-patient" label={t("doctor.lab.patient")} value={patient} onChange={(event) => setPatient(event.target.value)}>
      <option value="">{t("doctor.common.selectPatient")}</option>{patients.map((item) => <option key={item.id} value={item.id}>{item.full_name}{item.age != null ? ` · ${item.age} ${t("doctor.appointment.yearsShort")}` : ""}</option>)}
    </Select>
    <Select id="lab-test" label={t("doctor.lab.test")} value={test} onChange={(event) => setTest(event.target.value)}>
      <option value="">{t("doctor.common.selectTest")}</option>{tests.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </Select>
    {chosen?.prep_note && <p className="rounded-xl border border-dashed border-brand-600 bg-brand-50 px-4 py-3 text-brand-800">{fill(t("doctor.lab.prep"), { note: chosen.prep_note })}</p>}
    {linked && <p className="text-sm text-ink-muted">{fill(t("doctor.lab.linked"), { token: linked.token_no || linked.booking_no || "" })}</p>}
    <Textarea id="lab-notes" label={t("doctor.lab.notes")} optional rows={4} maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} />
    <div className="flex flex-wrap justify-end gap-3"><Button variant="secondary" fullWidth={false} onClick={onCancel}>{t("doctor.common.cancel")}</Button><Button fullWidth={false} disabled={!patient || !test || submitting} loading={submitting} onClick={onSubmit}>{t("doctor.lab.send")}</Button></div>
  </Card>;
}
