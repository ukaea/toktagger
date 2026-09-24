"use client";
import { useEffect, useState } from "react";
import { Flex, InlineAlert, Heading, Content } from "@adobe/react-spectrum";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/app/contexts/AuthContext";
import { useBreadcrumbs } from "@/app/contexts/BreadcrumbContext";
import { PasswordChangeDialog } from "@/app/components/ui/passwordChangeDialog";

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
    <div className="h-full">
      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-200 via-gray-300 to-gray-400 dark:from-gray-700 dark:via-gray-800 dark:to-gray-900">
        <div className="w-full md:w-4/5 p-6 bg-white/60 dark:bg-gray-800/60 text-gray-800 dark:text-gray-100 rounded-lg shadow-lg backdrop-blur-sm">
          <Heading level={1} marginBottom="size-200">
            Profile
          </Heading>
          <Flex direction="column" alignItems="center">
            <Flex
              direction="column"
              gap="size-300"
              width="size-6000"
              maxWidth="100%"
            >
              <p className="text-sm text-gray-600 dark:text-gray-300">
                <strong>Username:</strong> {user?.username}
                &nbsp;&nbsp;|&nbsp;&nbsp;
                <strong>Role:</strong> {user?.global_role}
              </p>

              {user?.must_change_password && (
                <InlineAlert variant="notice" width="100%">
                  <Heading>Password change required</Heading>
                  <Content>
                    You must set a new password before continuing.
                  </Content>
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
          </Flex>
        </div>
      </div>
    </div>
  );
}
