"use client";
import { Divider, Flex, Heading, Text, View } from "@adobe/react-spectrum";
import ApiTokens from "@/app/components/ui/apiTokens";
import { useAuth } from "@/app/contexts/AuthContext";
import { useBreadcrumbs } from "@/app/contexts/BreadcrumbContext";

export default function ProfilePage() {
  const { user } = useAuth();
  useBreadcrumbs([
    { key: "projects", label: "Projects", href: "/ui/projects/" },
    { key: "profile", label: "Profile" },
  ]);

  return (
    <Flex
      minHeight="100%"
      direction="column"
      justifyContent="center"
      alignItems="center"
      gap="size-300"
      marginY="size-300"
    >
      <View
        data-testid="profile-details"
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
        </Flex>
      </View>
      <View
        backgroundColor="gray-100"
        borderWidth="thin"
        borderColor="dark"
        borderRadius="medium"
        padding="size-300"
        width="size-10000"
        maxWidth="90%"
      >
        <ApiTokens />
      </View>
    </Flex>
  );
}
