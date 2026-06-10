export const PASSWORD_MIN_LENGTH = 8;

const PASSWORD_SPECIAL_CHAR_PATTERN = /[!@#$%&*()_+\-=?/.,;:]/;

export type PasswordRequirementId = "minLength" | "uppercase" | "specialChar";

export interface PasswordRequirementState {
  id: PasswordRequirementId;
  label: string;
  met: boolean;
}

export function getPasswordRequirements(password: string): PasswordRequirementState[] {
  return [
    {
      id: "minLength",
      label: "Mínimo de 8 caracteres",
      met: password.length >= PASSWORD_MIN_LENGTH,
    },
    {
      id: "uppercase",
      label: "Uma letra maiúscula",
      met: /[A-Z]/.test(password),
    },
    {
      id: "specialChar",
      label: "Um caractere especial",
      met: PASSWORD_SPECIAL_CHAR_PATTERN.test(password),
    },
  ];
}

export function isPasswordValid(password: string) {
  return getPasswordRequirements(password).every((requirement) => requirement.met);
}
