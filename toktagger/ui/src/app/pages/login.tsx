"use client";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import {
  Heading,
  InlineAlert,
  TextField,
  Button,
  Flex,
  View,
  Form,
} from "@adobe/react-spectrum";
import { useAuth } from "@/app/contexts/AuthContext";
import { PasswordField } from "@/app/components/ui/passwordField";

export default function LoginPage() {
  const { login, isLoading, user } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isLoading && user) {
    return <Navigate to="/ui/projects/" replace />;
  }

  const handleLogin = async () => {
    if (!username || !password) {
      setError("Invalid username or password");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    handleLogin();
  };

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
        <Heading level={2} marginBottom="size-300">
          TokTagger — Sign In
        </Heading>
        {error && (
          <InlineAlert variant="negative" marginBottom="size-200" width="100%">
            {error}
          </InlineAlert>
        )}
        <Form onSubmit={handleSubmit} width="100%">
          <Flex
            direction="column"
            alignItems="center"
            gap="size-200"
            width="100%"
          >
            <TextField
              label="Username"
              value={username}
              onChange={setUsername}
              autoFocus
              width="100%"
            />
            <PasswordField
              label="Password"
              value={password}
              onChange={setPassword}
            />
            <Button
              type="submit"
              variant="cta"
              isPending={submitting}
              isDisabled={submitting || !username || !password}
              width="100%"
              marginTop="size-100"
            >
              Sign In
            </Button>
          </Flex>
        </Form>
      </View>
    </Flex>
  );
}
