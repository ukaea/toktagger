"use client";
import {
  Breadcrumbs,
  Button,
  Flex,
  Item,
  Text,
  View,
} from "@adobe/react-spectrum";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/app/contexts/AuthContext";
import { useBreadcrumbItems } from "@/app/contexts/BreadcrumbContext";

export default function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.global_role === "admin";
  const breadcrumbItems = useBreadcrumbItems();

  return (
    <View
      height="size-700"
      flexShrink={0}
      paddingX="size-300"
      borderBottomWidth="thin"
      borderBottomColor="gray-300"
      backgroundColor="gray-50"
    >
      <Flex
        height="100%"
        alignItems="center"
        justifyContent="space-between"
        gap="size-200"
      >
        {/* Without flex the crumbs shrink to nothing and Spectrum folds all but the last into a "…" menu; minWidth 0 stops a long project name pushing the buttons off the bar. */}
        <View flex minWidth={0}>
          {breadcrumbItems.length > 0 && (
            <Breadcrumbs>
              {breadcrumbItems.map((item) => (
                <Item key={item.key} href={item.href}>
                  {item.label}
                </Item>
              ))}
            </Breadcrumbs>
          )}
        </View>
        <Flex alignItems="center" gap="size-100" flexShrink={0}>
          <Text>
            Signed in as <strong>{user?.username}</strong>
          </Text>
          <Button variant="secondary" onPress={() => navigate("/ui/profile")}>
            Profile
          </Button>
          {isAdmin && (
            <Button
              variant="secondary"
              onPress={() => navigate("/ui/admin/users")}
            >
              Admin Panel
            </Button>
          )}
          <Button variant="negative" onPress={logout}>
            Sign Out
          </Button>
        </Flex>
      </Flex>
    </View>
  );
}
