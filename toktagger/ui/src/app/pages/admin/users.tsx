"use client";
import { useState, useEffect, useCallback } from "react";
import {
  TableView,
  TableHeader,
  TableBody,
  Column,
  Row,
  Cell,
  Button,
  Flex,
  DialogTrigger,
  Dialog,
  Heading,
  Divider,
  Content,
  ButtonGroup,
  Text,
  ToastQueue,
} from "@adobe/react-spectrum";
import Delete from "@spectrum-icons/workflow/Delete";
import { BACKEND_API_URL, apiFetch, formatApiDetail } from "@/app/core";
import { useAuth } from "@/app/contexts/AuthContext";
import { useBreadcrumbs } from "@/app/contexts/BreadcrumbContext";
import { type CurrentUser } from "@/types";

type UserRow = CurrentUser & { id: string };

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  useBreadcrumbs([
    { key: "projects", label: "Projects", href: "/ui/projects/" },
    { key: "admin", label: "Admin" },
    { key: "users", label: "Users" },
  ]);
  const [users, setUsers] = useState<UserRow[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch(`${BACKEND_API_URL}/users`);
      if (!res.ok) throw new Error("Failed to load users");
      const data: CurrentUser[] = await res.json();
      setUsers(data.map((u) => ({ ...u, id: u._id })));
    } catch (e) {
      ToastQueue.negative(e instanceof Error ? e.message : "Error", {
        timeout: 2000,
      });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggleActivation = async (userId: string, isActive: boolean) => {
    try {
      const res = await apiFetch(`${BACKEND_API_URL}/users/${userId}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: !isActive }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(formatApiDetail(d, "Failed to update user"));
      }
      await refresh();
      ToastQueue.positive(isActive ? "User deactivated" : "User activated", {
        timeout: 2000,
      });
    } catch (e) {
      ToastQueue.negative(e instanceof Error ? e.message : "Error", {
        timeout: 2000,
      });
    }
  };

  const deleteUser = async (userId: string, close: () => void) => {
    try {
      const res = await apiFetch(`${BACKEND_API_URL}/users/${userId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(formatApiDetail(d, "Failed to delete user"));
      }
      close();
      await refresh();
      ToastQueue.positive("User deleted", { timeout: 2000 });
    } catch (e) {
      ToastQueue.negative(e instanceof Error ? e.message : "Error", {
        timeout: 2000,
      });
    }
  };

  return (
    <div className="h-full">
      <div className="w-full min-h-full flex items-start justify-center bg-gradient-to-br from-gray-200 via-gray-300 to-gray-400 dark:from-gray-700 dark:via-gray-800 dark:to-gray-900 py-6">
        <div className="w-full md:w-4/5 p-6 bg-white/60 dark:bg-gray-800/60 text-gray-800 dark:text-gray-100 rounded-lg shadow-lg backdrop-blur-sm">
          <Flex
            justifyContent="space-between"
            alignItems="center"
            marginBottom="size-200"
          >
            <Heading level={2}>User Management</Heading>
          </Flex>

          <Text UNSAFE_style={{ display: "block", marginBottom: 12 }}>
            Users appear here after their first sign-in. Accounts, passwords and
            roles are managed in the identity provider.
          </Text>

          <TableView aria-label="Users" selectionMode="none">
            <TableHeader>
              <Column key="username">Username</Column>
              <Column key="global_role" width={120}>
                Role
              </Column>
              <Column key="is_active" width={100}>
                Active
              </Column>
              <Column key="actions" minWidth={240}>
                Actions
              </Column>
            </TableHeader>
            <TableBody items={users}>
              {(item) => (
                <Row key={item.id}>
                  <Cell>{item.username}</Cell>
                  <Cell>{item.global_role}</Cell>
                  <Cell>{item.is_active ? "Yes" : "No"}</Cell>
                  <Cell>
                    <Flex gap="size-100">
                      <DialogTrigger>
                        <Button
                          aria-label="Delete"
                          variant="negative"
                          isDisabled={item.id === currentUser?._id}
                        >
                          <Delete />
                        </Button>
                        {(close) => (
                          <Dialog>
                            <Heading>Delete User</Heading>
                            <Divider />
                            <Content>
                              Delete user <strong>{item.username}</strong>? This
                              cannot be undone.
                            </Content>
                            <ButtonGroup>
                              <Button variant="secondary" onPress={close}>
                                Cancel
                              </Button>
                              <Button
                                variant="negative"
                                onPress={() => deleteUser(item.id, close)}
                              >
                                Delete
                              </Button>
                            </ButtonGroup>
                          </Dialog>
                        )}
                      </DialogTrigger>
                      <Button
                        variant="secondary"
                        isDisabled={item.id === currentUser?._id}
                        onPress={() =>
                          toggleActivation(item.id, item.is_active)
                        }
                        UNSAFE_style={{ minInlineSize: 0, flexShrink: 0 }}
                      >
                        {item.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    </Flex>
                  </Cell>
                </Row>
              )}
            </TableBody>
          </TableView>
        </div>
      </div>
    </div>
  );
}
