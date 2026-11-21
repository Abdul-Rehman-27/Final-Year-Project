import { useCallback, useEffect, useState } from "react";
import { roleService } from "../services/roleService.js";

export default function useRoles() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRoles(await roleService.list());
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

  /** Returns the new role so the page can select it. */
  const addRole = async (data) => {
    const role = await roleService.create(data);
    await reload();
    return role;
  };
  const updateRole = async (id, data) => {
    await roleService.update(id, data);
    await reload();
  };
  const savePermissions = async (id, permissionIds) => {
    await roleService.setPermissions(id, permissionIds);
    await reload();
  };
  const removeRole = async (id) => {
    await roleService.remove(id);
    await reload();
  };

  return { roles, loading, error, reload, addRole, updateRole, savePermissions, removeRole };
}
