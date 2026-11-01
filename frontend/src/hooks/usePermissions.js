import { useCallback, useEffect, useState } from "react";
import { permissionService } from "../services/permissionService.js";

export default function usePermissions() {
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setPermissions(await permissionService.list());
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
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

  return { permissions, loading, addPermission, updatePermission, removePermission };
}
