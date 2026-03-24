import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface CurrencyInputProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

function formatBRLInput(value: number): string {
  if (value === 0) return "";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseBRLInput(text: string): number {
  if (!text.trim()) return 0;
  // Remove dots (thousand separators), replace comma with dot
  const cleaned = text.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export function CurrencyInput({ value, onChange, className, placeholder = "0,00", disabled }: CurrencyInputProps) {
  const [display, setDisplay] = useState(() => formatBRLInput(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDisplay(formatBRLInput(value));
    }
  }, [value, focused]);

  const handleFocus = useCallback(() => {
    setFocused(true);
    setDisplay(value > 0 ? formatBRLInput(value) : "");
  }, [value]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    const parsed = parseBRLInput(display);
    onChange(parsed);
    setDisplay(formatBRLInput(parsed));
  }, [display, onChange]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Allow only digits, dots, commas
    const filtered = raw.replace(/[^\d.,]/g, "");
    setDisplay(filtered);
  }, []);

  return (
    <Input
      value={display}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(className)}
      inputMode="decimal"
    />
  );
}
