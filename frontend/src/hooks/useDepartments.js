import { useCallback, useEffect, useState } from "react";
import { departmentService } from "../services/departmentService.js";

/** Department list + add / update / remove helpers (the list is reloaded after every change). */
export default function useDepartments() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setDepartments(await departmentService.list());
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
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

  return { departments, loading, addDepartment, updateDepartment, removeDepartment };
}
