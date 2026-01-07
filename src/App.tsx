import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { SystemSetupCheck } from "@/components/setup/SystemSetupCheck";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ChangePassword from "./pages/ChangePassword";
import AdminDashboard from "./pages/admin/AdminDashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <SystemSetupCheck>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/change-password" element={<ChangePassword />} />
              <Route path="/admin/*" element={<AdminDashboard />} />
              <Route path="/" element={<Index />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </SystemSetupCheck>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
