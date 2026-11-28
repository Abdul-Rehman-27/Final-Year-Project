import { useCallback, useEffect, useState } from "react";
import { departmentService } from "../services/departmentService.js";

/** Department list + add / update / remove helpers (the list is reloaded after every change). */
export default function useDepartments() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setDepartments(await departmentService.list());
      setError(false);
    } catch (err) {
      setError(true);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  const addDepartment = async (data) => {
    await departmentService.create(data);
    await reload();
  };
  const updateDepartment = async (id, data) => {
    await departmentService.update(id, data);
    await reload();
  };
  const removeDepartment = async (id) => {
    await departmentService.remove(id);
    await reload();
  };

  return { departments, loading, error, addDepartment, updateDepartment, removeDepartment };
}
