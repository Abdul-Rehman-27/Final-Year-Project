import { useEffect, useState } from "react";
import { staffService } from "../services/staffService.js";

/** Loads the staff list and gives add/update helpers that keep the list in sync. */
export default function useStaff() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    staffService.list().then((data) => {
      if (active) setStaff(data);
    }).catch(() => {
      if (active) setError("load_failed");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const addStaff = async (data) => {
    const { member, tempPassword } = await staffService.create(data);
    setStaff((prev) => [member, ...prev]);
    setError("");
    return tempPassword;
  };

  const updateStaff = async (id, data) => {
    const member = await staffService.update(id, data);
    setStaff((prev) => prev.map((s) => (s.id === id ? member : s)));
    setError("");
  };

  return { staff, loading, error, addStaff, updateStaff };
}
