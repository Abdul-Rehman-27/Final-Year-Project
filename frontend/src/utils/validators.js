import { z } from "zod";

// Rules are shared with the backend (app/schemas/auth.py). Keep them in sync.
export const NAME_RE = /^[A-Za-z؀-ۿ][A-Za-z؀-ۿ .'-]*$/;
export const PHONE_RE = /^(03\d{9}|\+923\d{9})$/;

export const PASSWORD_RULES = [
  { key: "length", test: (v) => v.length >= 8 },
  { key: "lower", test: (v) => /[a-z]/.test(v) },
  { key: "upper", test: (v) => /[A-Z]/.test(v) },
  { key: "number", test: (v) => /\d/.test(v) },
  { key: "special", test: (v) => /[^A-Za-z0-9\s]/.test(v) },
];

/** 0-5: how many password rules are satisfied. */
export const passwordScore = (v = "") => PASSWORD_RULES.filter((r) => r.test(v)).length;

/** Strip spaces/dashes so "0300 123-4567" is accepted and sent as 03001234567. */
export const normalizePhone = (v = "") => v.replace(/[\s-]/g, "");

const todayISO = () => new Date().toISOString().slice(0, 10);

/** Builders take the translate function `t` so error messages follow the UI language. */
export function loginSchema(t) {
  return z.object({
    email: z
      .string()
      .trim()
      .min(1, t("validation.required"))
      .max(255, t("validation.emailMax"))
      .email(t("validation.emailInvalid")),
    password: z.string().min(1, t("validation.required")).max(64, t("validation.passwordMax")),
  });
}

export function registerSchema(t) {
  return z
    .object({
      fullName: z
        .string()
        .transform((v) => v.trim().replace(/\s+/g, " "))
        .pipe(
          z
            .string()
            .min(1, t("validation.required"))
            .min(3, t("validation.nameMin"))
            .max(50, t("validation.nameMax"))
            .regex(NAME_RE, t("validation.nameChars"))
        ),
      email: z
        .string()
        .trim()
        .min(1, t("validation.required"))
        .max(255, t("validation.emailMax"))
        .email(t("validation.emailInvalid")),
      phone: z
        .string()
        .min(1, t("validation.required"))
        .transform(normalizePhone)
        .pipe(z.string().regex(PHONE_RE, t("validation.phoneInvalid"))),
      dob: z
        .string()
        .min(1, t("validation.dobRequired"))
        .refine((v) => v < todayISO(), t("validation.dobFuture"))
        .refine((v) => new Date().getFullYear() - Number(v.slice(0, 4)) <= 120, t("validation.dobOld")),
      // refine (not enum/literal) so a wrong value does not abort the cross-field password check below
      gender: z.string().refine((v) => ["male", "female", "other"].includes(v), t("validation.genderRequired")),
      password: z
        .string()
        .min(1, t("validation.required"))
        .min(8, t("validation.passwordMin"))
        .max(64, t("validation.passwordMax"))
        .refine((v) => !/\s/.test(v), t("validation.passwordSpaces"))
        .refine((v) => /[a-z]/.test(v), t("validation.passwordLower"))
        .refine((v) => /[A-Z]/.test(v), t("validation.passwordUpper"))
        .refine((v) => /\d/.test(v), t("validation.passwordNumber"))
        .refine((v) => /[^A-Za-z0-9\s]/.test(v), t("validation.passwordSpecial")),
      confirmPassword: z.string().min(1, t("validation.required")),
      acceptTerms: z.boolean().refine((v) => v === true, t("validation.termsRequired")),
    })
    .refine((d) => d.password === d.confirmPassword, {
      path: ["confirmPassword"],
      message: t("validation.passwordMatch"),
    });
}

/** Add / edit staff form. Doctor-only fields (specialty, fee) are checked in superRefine. */
export function staffSchema(t) {
  return z
    .object({
      fullName: z
        .string()
        .transform((v) => v.trim().replace(/\s+/g, " "))
        .pipe(
          z
            .string()
            .min(1, t("validation.required"))
            .min(3, t("validation.nameMin"))
            .max(50, t("validation.nameMax"))
            .regex(NAME_RE, t("validation.nameChars"))
        ),
      email: z
        .string()
        .trim()
        .min(1, t("validation.required"))
        .max(255, t("validation.emailMax"))
        .email(t("validation.emailInvalid")),
      phone: z
        .string()
        .min(1, t("validation.required"))
        .transform(normalizePhone)
        .pipe(z.string().regex(PHONE_RE, t("validation.phoneInvalid"))),
      role: z.string().min(1, t("validation.roleRequired")),
      departmentId: z.string().min(1, t("validation.departmentRequired")),
      photo: z.string(),
      specialty: z.string().trim().max(50, t("validation.specialtyMax")),
      fee: z.string().trim(),
      status: z.string(),
    })
    .superRefine((data, ctx) => {
      if (data.role !== "doctor") return;
      if (data.specialty.length < 2) {
        ctx.addIssue({ code: "custom", path: ["specialty"], message: t("validation.specialtyRequired") });
      }
      const fee = Number(data.fee);
      if (!data.fee || !Number.isInteger(fee) || fee < 100 || fee > 100000) {
        ctx.addIssue({ code: "custom", path: ["fee"], message: t("validation.feeInvalid") });
      }
    });
}

export const CODE_RE = /^[a-z][a-z0-9_:]*$/;

const cleanName = (t, min, max) =>
  z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(1, t("validation.required"))
        .min(min, t(min === 2 ? "validation.nameMin2" : "validation.nameMin"))
        .max(max, t(max === 30 ? "validation.nameMax30" : "validation.nameMax40"))
    );

/** Department: name + optional description. */
export function departmentSchema(t) {
  return z.object({
    name: cleanName(t, 2, 40),
    description: z.string().trim().max(200, t("validation.descMax")),
  });
}

/** Permission: name + unique code + optional description. */
export function permissionSchema(t) {
  return z.object({
    name: cleanName(t, 2, 40),
    code: z
      .string()
      .trim()
      .min(1, t("validation.required"))
      .max(40, t("validation.codeMax"))
      .regex(CODE_RE, t("validation.codeInvalid")),
    description: z.string().trim().max(200, t("validation.descMax")),
  });
}

/** Role: name + optional description (permissions are assigned separately). */
export function roleSchema(t) {
  return z.object({
    name: cleanName(t, 2, 30),
    description: z.string().trim().max(200, t("validation.descMax")),
  });
}

/** One benchmark query with its ground-truth label. */
export function benchmarkQuerySchema(t) {
  return z.object({
    lang: z.string().refine((v) => ["en", "ur"].includes(v), t("validation.required")),
    category: z.string().min(1, t("validation.required")),
    query: z
      .string()
      .trim()
      .min(1, t("validation.required"))
      .min(5, t("validation.queryMin"))
      .max(300, t("validation.queryMax")),
    truth: z.string().trim().min(1, t("validation.required")).max(100, t("validation.truthMax")),
  });
}
