"use client";
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, BACKEND_API_URL, setUnauthorizedHandler } from "@/app/core";
import {
  CurrentUserSchema,
  LogoutResponseSchema,
  type CurrentUser,
} from "@/types";

interface AuthContextType {
  user: CurrentUser | null;
  isLoading: boolean;
  login: (returnTo?: string) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const fetchCurrentUser = async (): Promise<CurrentUser | null> => {
  const res = await apiFetch(`${BACKEND_API_URL}/auth/me`);
  if (!res.ok) return null;
  const parsed = CurrentUserSchema.safeParse(await res.json());
  return parsed.success ? parsed.data : null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const refreshUser = async () => {
    setUser(await fetchCurrentUser());
  };

  // Re-registered as `user` changes so the check below sees the current value.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (!user) return;
      setUser(null);
      navigate("/ui/login", { replace: true });
    });
    return () => setUnauthorizedHandler(null);
  }, [user, navigate]);

  // The session cookie is invisible to JS, so asking the server is the only way to
  // know whether one is held.
  useEffect(() => {
    const validate = async () => {
      try {
        setUser(await fetchCurrentUser());
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };
    validate();
  }, []);

  const login = (returnTo?: string) => {
    const query = returnTo?.startsWith("/ui/")
      ? `?return_to=${encodeURIComponent(returnTo)}`
      : "";
    window.location.assign(`${BACKEND_API_URL}/auth/login${query}`);
  };

  const logout = async () => {
    // A failed call must not strand the user in a logged-in UI, so sign out locally regardless.
    const res = await apiFetch(`${BACKEND_API_URL}/auth/logout`, {
      method: "POST",
    }).catch(() => null);
    const parsed = LogoutResponseSchema.safeParse(
      await res?.json().catch(() => null),
    );
    setUser(null);
    if (parsed.success && parsed.data.logout_url) {
      window.location.assign(parsed.data.logout_url);
      return;
    }
    navigate("/ui/login", { replace: true });
  };

  return (
    <AuthContext.Provider
      value={{ user, isLoading, login, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
