"use client";
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiFetch, BACKEND_API_URL, setUnauthorizedHandler } from "@/app/core";
import { CurrentUserSchema, type CurrentUser } from "@/types";

interface AuthContextType {
  user: CurrentUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
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
  const location = useLocation();

  const refreshUser = async () => {
    const me = await fetchCurrentUser();
    if (me) setUser(me);
  };

  // Force a password change before anything else - an admin knows the password they
  // just set on a new account, so the new owner must replace it on first login.
  useEffect(() => {
    if (user?.must_change_password && location.pathname !== "/ui/profile") {
      navigate("/ui/profile", { replace: true });
    }
  }, [user, location.pathname, navigate]);

  // Re-registered as `user` changes so the check below sees the current value.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (!user) return;
      setUser(null);
      navigate("/ui/login");
    });
    return () => setUnauthorizedHandler(null);
  }, [user, navigate]);

  // The session cookie is invisible to JS, so asking the server is the only way to
  // know whether one is held.
  useEffect(() => {
    const validate = async () => {
      // One-off cleanup: sessions predating the cookie left a readable token behind.
      localStorage.removeItem("tt_access_token");
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

  const login = async (username: string, password: string) => {
    const body = new URLSearchParams({ username, password });
    // The response sets the session cookie; its body is for non-browser clients.
    const res = await apiFetch(`${BACKEND_API_URL}/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.detail ?? "Login failed");
    }

    const me = await fetchCurrentUser();
    if (!me) {
      throw new Error("Login failed: could not load user profile");
    }
    setUser(me);
  };

  const logout = async () => {
    // Only the server can clear an httpOnly cookie, but a failed call must not strand
    // the user in a logged-in UI, so sign out locally regardless.
    await apiFetch(`${BACKEND_API_URL}/auth/logout`, { method: "POST" }).catch(
      () => {},
    );
    setUser(null);
    navigate("/ui/login");
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
