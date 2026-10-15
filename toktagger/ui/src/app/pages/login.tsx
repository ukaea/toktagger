"use client";
import { Navigate, useSearchParams } from "react-router-dom";
import {
  Heading,
  Button,
  Flex,
  View,
  InlineAlert,
  Content,
} from "@adobe/react-spectrum";
import { useAuth } from "@/app/contexts/AuthContext";

const ERROR_MESSAGES: Record<string, string> = {
  inactive: "This account is deactivated. Ask an administrator for access.",
  idp_unavailable:
    "The identity provider is not available. Try again in a moment.",
};
const DEFAULT_ERROR = "Sign-in failed. Try again.";

export default function LoginPage() {
  const { login, isLoading, user } = useAuth();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("return_to") ?? undefined;
  const errorCode = searchParams.get("error");

  if (!isLoading && user) {
    return <Navigate to={returnTo ?? "/ui/projects/"} replace />;
  }

  return (
    <Flex
      width="100vw"
      height="100vh"
      alignItems="center"
      justifyContent="center"
      UNSAFE_style={{
        background:
          "linear-gradient(to bottom right, var(--spectrum-global-color-gray-200), var(--spectrum-global-color-gray-400))",
      }}
    >
      <View
        backgroundColor="gray-50"
        borderRadius="large"
        padding="size-500"
        minWidth="size-4600"
        UNSAFE_style={{
          boxShadow: "var(--spectrum-alias-dropshadow-color) 0 10px 40px",
        }}
      >
        <Flex direction="column" gap="size-200">
          <Heading level={2} margin={0}>
            TokTagger — Sign In
          </Heading>
          {errorCode && (
            <InlineAlert variant="negative" width="100%">
              <Heading>Could not sign in</Heading>
              <Content>{ERROR_MESSAGES[errorCode] ?? DEFAULT_ERROR}</Content>
            </InlineAlert>
          )}
          <Button
            variant="cta"
            width="100%"
            isDisabled={isLoading}
            onPress={() => login(returnTo)}
          >
            Sign In
          </Button>
        </Flex>
      </View>
    </Flex>
  );
}
