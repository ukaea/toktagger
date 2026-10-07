"use client";
import { useEffect, useState } from "react";
import {
  Divider,
  Flex,
  Heading,
  Link,
  Text,
  View,
} from "@adobe/react-spectrum";
import { useAuth } from "@/app/contexts/AuthContext";
import { useBreadcrumbs } from "@/app/contexts/BreadcrumbContext";
import { BACKEND_API_URL, apiFetch } from "@/app/core";
import { AuthConfigSchema, type AuthConfig } from "@/types";

export default function ProfilePage() {
  const { user } = useAuth();
  useBreadcrumbs([
    { key: "projects", label: "Projects", href: "/ui/projects/" },
    { key: "profile", label: "Profile" },
  ]);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);

  useEffect(() => {
    const loadConfig = async () => {
      const res = await apiFetch(`${BACKEND_API_URL}/auth/config`);
      if (!res.ok) return;
      const parsed = AuthConfigSchema.safeParse(await res.json());
      if (parsed.success) setAuthConfig(parsed.data);
    };
    loadConfig().catch(() => {});
  }, []);

  return (
    <Flex height="100%" justifyContent="center" alignItems="center">
      <View
        backgroundColor="gray-100"
        borderWidth="thin"
        borderColor="dark"
        borderRadius="medium"
        padding="size-300"
        width="size-6000"
        maxWidth="90%"
      >
        <Flex direction="column" gap="size-200">
          <Heading level={1} margin={0}>
            Profile
          </Heading>
          <Divider size="S" />

          <Flex direction="column" gap="size-100">
            <Flex justifyContent="space-between">
              <Text>Username</Text>
              <Text>{user?.username}</Text>
            </Flex>
            {user?.display_name && (
              <Flex justifyContent="space-between">
                <Text>Name</Text>
                <Text>{user.display_name}</Text>
              </Flex>
            )}
            {user?.email && (
              <Flex justifyContent="space-between">
                <Text>Email</Text>
                <Text>{user.email}</Text>
              </Flex>
            )}
            <Flex justifyContent="space-between">
              <Text>Role</Text>
              <Text>{user?.global_role}</Text>
            </Flex>
          </Flex>

          {authConfig?.account_url && (
            <Link href={authConfig.account_url} target="_blank">
              Manage account
            </Link>
          )}
        </Flex>
      </View>
    </Flex>
  );
}
