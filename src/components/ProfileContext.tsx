"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

interface ProfileSummary {
  id: string;
  name: string;
}

interface ProfileContextValue {
  activeProfileId: string | null;
  activeProfile: ProfileSummary | null;
  profiles: ProfileSummary[];
  setActiveProfileId: (id: string) => void;
  refreshProfiles: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue>({
  activeProfileId: null,
  activeProfile: null,
  profiles: [],
  setActiveProfileId: () => {},
  refreshProfiles: async () => {},
});

const STORAGE_KEY = "applyforme_active_profile";

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [activeProfileId, setActiveProfileIdState] = useState<string | null>(
    null
  );

  const refreshProfiles = useCallback(async () => {
    try {
      const res = await fetch("/api/profiles");
      if (!res.ok) throw new Error("Failed to fetch profiles");
      const data: ProfileSummary[] = await res.json();
      setProfiles(data);
    } catch (err) {
      console.error("Error fetching profiles:", err);
    }
  }, []);

  const setActiveProfileId = useCallback(
    (id: string) => {
      setActiveProfileIdState(id);
      try {
        localStorage.setItem(STORAGE_KEY, id);
      } catch {
        // localStorage may not be available
      }
    },
    []
  );

  // Load saved profile from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setActiveProfileIdState(saved);
      }
    } catch {
      // localStorage may not be available
    }
    refreshProfiles();
  }, [refreshProfiles]);

  const activeProfile =
    profiles.find((p) => p.id === activeProfileId) ?? null;

  return (
    <ProfileContext.Provider
      value={{
        activeProfileId,
        activeProfile,
        profiles,
        setActiveProfileId,
        refreshProfiles,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
