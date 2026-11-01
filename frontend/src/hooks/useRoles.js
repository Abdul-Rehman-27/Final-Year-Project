import { useCallback, useEffect, useState } from "react";
import { roleService } from "../services/roleService.js";

export default function useRoles() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setRoles(await roleService.list());
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
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

  return { roles, loading, reload, addRole, updateRole, savePermissions, removeRole };
}
