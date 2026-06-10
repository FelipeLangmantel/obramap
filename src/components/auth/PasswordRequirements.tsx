import { CheckCircle2, Circle } from "lucide-react";
import { getPasswordRequirements, isPasswordValid } from "@/lib/passwordValidation";
import { cn } from "@/lib/utils";

interface PasswordRequirementsProps {
  password: string;
  className?: string;
  showSuccessMessage?: boolean;
}

export function PasswordRequirements({
  password,
  className,
  showSuccessMessage = true,
}: PasswordRequirementsProps) {
  const requirements = getPasswordRequirements(password);
  const isValid = isPasswordValid(password);

  return (
    <div className={cn("rounded-lg border bg-muted/30 p-3 text-xs", className)}>
      <p className="font-medium text-foreground">Para segurança, sua senha deve conter:</p>
      <div className="mt-2 space-y-1.5">
        {requirements.map((requirement) => (
          <div
            key={requirement.id}
            className={cn(
              "flex items-center gap-2 transition-colors",
              requirement.met ? "text-emerald-600" : "text-muted-foreground"
            )}
          >
            {requirement.met ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-muted-foreground/70" />
            )}
            <span>{requirement.label}</span>
          </div>
        ))}
      </div>
      {showSuccessMessage && isValid && (
        <p className="mt-2 font-medium text-emerald-600">
          Senha atende aos requisitos de segurança.
        </p>
      )}
    </div>
  );
}
