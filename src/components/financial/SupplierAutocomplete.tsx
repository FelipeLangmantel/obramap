import { useState, useEffect, useRef, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Supplier {
  id: string;
  name: string;
  pix_key: string | null;
  pix_key_type: string | null;
  supplier_scope: string;
}

interface SupplierAutocompleteProps {
  suppliers: Supplier[];
  value: string;
  selectedId: string;
  onChange: (value: string) => void;
  onSelect: (supplier: Supplier) => void;
  onCreateNew: (name: string) => void;
  placeholder?: string;
}

export function SupplierAutocomplete({
  suppliers,
  value,
  selectedId,
  onChange,
  onSelect,
  onCreateNew,
  placeholder = "Digite para buscar fornecedor..."
}: SupplierAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update input when value prop changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Filter suppliers based on input
  const filteredSuppliers = useMemo(() => {
    if (!inputValue) return suppliers.slice(0, 10);
    const search = inputValue.toLowerCase();
    return suppliers.filter(s => 
      s.name.toLowerCase().includes(search)
    ).slice(0, 10);
  }, [suppliers, inputValue]);

  // Check if current input matches any supplier exactly
  const exactMatch = useMemo(() => {
    if (!inputValue) return null;
    return suppliers.find(s => 
      s.name.toLowerCase() === inputValue.toLowerCase()
    );
  }, [suppliers, inputValue]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);
    setIsOpen(true);
  };

  const handleSelectSupplier = (supplier: Supplier) => {
    setInputValue(supplier.name);
    onSelect(supplier);
    setIsOpen(false);
  };

  const handleCreateNew = () => {
    if (inputValue.trim()) {
      onCreateNew(inputValue.trim());
      setIsOpen(false);
    }
  };

  const handleClear = () => {
    setInputValue("");
    onChange("");
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="pr-8"
        />
        {inputValue && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
            onClick={handleClear}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
      
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-[250px] overflow-auto">
          {filteredSuppliers.length > 0 && (
            <div className="p-1">
              <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                Fornecedores
              </div>
              {filteredSuppliers.map(supplier => (
                <button
                  key={supplier.id}
                  type="button"
                  className={cn(
                    "w-full flex items-center justify-between px-2 py-2 text-sm rounded hover:bg-accent cursor-pointer text-left",
                    selectedId === supplier.id && "bg-accent"
                  )}
                  onClick={() => handleSelectSupplier(supplier)}
                >
                  <span className="truncate">{supplier.name}</span>
                  <Badge variant="outline" className="text-xs ml-2 shrink-0">
                    {supplier.supplier_scope === 'global' ? 'Geral' : 'Obra'}
                  </Badge>
                </button>
              ))}
            </div>
          )}
          
          {inputValue && !exactMatch && (
            <div className="p-1 border-t">
              <button
                type="button"
                className="w-full flex items-center gap-2 px-2 py-2 text-sm rounded hover:bg-accent cursor-pointer text-primary"
                onClick={handleCreateNew}
              >
                <UserPlus className="h-4 w-4" />
                Cadastrar "{inputValue}" como novo fornecedor
              </button>
            </div>
          )}
          
          {!inputValue && filteredSuppliers.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground text-center">
              Nenhum fornecedor cadastrado
            </div>
          )}
        </div>
      )}
    </div>
  );
}
