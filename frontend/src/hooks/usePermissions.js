import { useCallback, useEffect, useState } from "react";
import { permissionService } from "../services/permissionService.js";

export default function usePermissions() {
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setPermissions(await permissionService.list());
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

  const addPermission = async (data) => {
    await permissionService.create(data);
    await reload();
  };
  const updatePermission = async (id, data) => {
    await permissionService.update(id, data);
    await reload();
  };
  const removePermission = async (id) => {
    await permissionService.remove(id);
    await reload();
  };

  return { permissions, loading, error, addPermission, updatePermission, removePermission };
}
