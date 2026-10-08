"use client";
import { useEffect, useState } from "react";
import {
  Content,
  Divider,
  Flex,
  Heading,
  InlineAlert,
  Text,
  View,
} from "@adobe/react-spectrum";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/app/contexts/AuthContext";
import { useBreadcrumbs } from "@/app/contexts/BreadcrumbContext";
import { PasswordChangeDialog } from "@/app/components/ui/password";

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  useBreadcrumbs([
    { key: "projects", label: "Projects", href: "/ui/projects/" },
    { key: "profile", label: "Profile" },
  ]);

  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);

  useEffect(() => {
    if (user?.must_change_password) setIsPasswordDialogOpen(true);
  }, [user]);

  const onPasswordChanged = async () => {
    await refreshUser();
    if (user?.must_change_password) navigate("/ui/projects");
  };

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
            <Flex justifyContent="space-between">
              <Text>Role</Text>
              <Text>{user?.global_role}</Text>
            </Flex>
          </Flex>

          {user?.must_change_password && (
            <InlineAlert variant="notice" width="100%">
              <Heading>Password change required</Heading>
              <Content>You must set a new password before continuing.</Content>
            </InlineAlert>
          )}

          {user && (
            <PasswordChangeDialog
              userId={user._id}
              triggerLabel="Change Password"
              heading="Change Password"
              forceChangeOnNextLogin={false}
              successMessage="Password changed"
              triggerVariant="cta"
              isOpen={isPasswordDialogOpen}
              onOpenChange={setIsPasswordDialogOpen}
              isDismissable={!user.must_change_password}
              onSuccess={onPasswordChanged}
            />
          )}
        </Flex>
      </View>
    </Flex>
  );
}
