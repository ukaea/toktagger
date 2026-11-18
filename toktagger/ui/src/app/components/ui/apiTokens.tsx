"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Button,
  ButtonGroup,
  Cell,
  Column,
  Content,
  Dialog,
  DialogTrigger,
  Divider,
  Flex,
  Form,
  Heading,
  InlineAlert,
  Item,
  Picker,
  Row,
  TableBody,
  TableHeader,
  TableView,
  Text,
  TextField,
  ToastQueue,
} from "@adobe/react-spectrum";
import type { Key } from "@react-types/shared";
import Delete from "@spectrum-icons/workflow/Delete";
import { z } from "zod/v4";
import { BACKEND_API_URL, apiFetch, formatApiDetail } from "@/app/core";
import { ApiTokenCreatedSchema, ApiTokenSchema, type ApiToken } from "@/types";

const TOKENS_URL = `${BACKEND_API_URL}/users/me/tokens`;
const LIFETIME_OPTIONS = [
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
  { key: "365", label: "1 year" },
];

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleString() : "Never";

const showError = (error: unknown) =>
  ToastQueue.negative(error instanceof Error ? error.message : "Error", {
    timeout: 2000,
  });

async function readError(res: Response, fallback: string): Promise<Error> {
  const body: unknown = await res.json().catch(() => null);
  return new Error(formatApiDetail(body, fallback));
}

export default function ApiTokens() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [name, setName] = useState("");
  const [lifetime, setLifetime] = useState<Key>("30");
  const [newToken, setNewToken] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await apiFetch(TOKENS_URL);
    if (!res.ok) throw await readError(res, "Failed to load API tokens");
    const parsed = z.array(ApiTokenSchema).safeParse(await res.json());
    if (!parsed.success) throw new Error("Unexpected API token list");
    setTokens(parsed.data);
  }, []);

  useEffect(() => {
    refresh().catch(showError);
  }, [refresh]);

  const createToken = async () => {
    try {
      const res = await apiFetch(TOKENS_URL, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          expires_in_days: Number(lifetime),
        }),
      });
      if (!res.ok) throw await readError(res, "Failed to create API token");
      const parsed = ApiTokenCreatedSchema.safeParse(await res.json());
      if (!parsed.success) throw new Error("Unexpected API token response");
      setNewToken(parsed.data.token);
      setName("");
      await refresh();
    } catch (e) {
      showError(e);
    }
  };

  const revokeToken = async (tokenId: string, close: () => void) => {
    try {
      const res = await apiFetch(`${TOKENS_URL}/${tokenId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw await readError(res, "Failed to revoke API token");
      close();
      await refresh();
      ToastQueue.positive("API token revoked", { timeout: 2000 });
    } catch (e) {
      showError(e);
    }
  };

  const copyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      ToastQueue.positive("Copied to the clipboard", { timeout: 2000 });
    } catch {
      ToastQueue.negative("Could not copy. Select the token and copy it.", {
        timeout: 2000,
      });
    }
  };

  return (
    <Flex direction="column" gap="size-150">
      <Heading level={2} margin={0}>
        API tokens
      </Heading>
      <Text>
        Scripts use an API token to call TokTagger as you. Send it in the header{" "}
        <code>Authorization: Bearer &lt;token&gt;</code>, or set{" "}
        <code>TOKTAGGER_API_TOKEN</code> for the TokTagger scripts.
      </Text>

      {newToken && (
        <InlineAlert variant="positive" width="100%">
          <Heading>Copy your new token</Heading>
          <Content>
            <Flex direction="column" gap="size-100">
              <Text>TokTagger shows this token one time only.</Text>
              <TextField
                aria-label="New API token"
                value={newToken}
                isReadOnly
                width="100%"
                data-testid="new-api-token"
              />
              <Flex gap="size-100">
                <Button variant="primary" onPress={() => copyToken(newToken)}>
                  Copy
                </Button>
                <Button variant="secondary" onPress={() => setNewToken(null)}>
                  Done
                </Button>
              </Flex>
            </Flex>
          </Content>
        </InlineAlert>
      )}

      <Form
        aria-label="Create API token"
        onSubmit={(event) => {
          event.preventDefault();
          createToken();
        }}
      >
        <Flex gap="size-100" alignItems="end" wrap>
          <TextField
            label="Token name"
            value={name}
            onChange={setName}
            maxLength={100}
            isRequired
            flexGrow={1}
          />
          <Picker
            label="Expires after"
            selectedKey={lifetime}
            onSelectionChange={(key) => key !== null && setLifetime(key)}
            items={LIFETIME_OPTIONS}
            width="size-1600"
          >
            {(option) => <Item key={option.key}>{option.label}</Item>}
          </Picker>
          <Button type="submit" variant="accent" isDisabled={!name.trim()}>
            Create token
          </Button>
        </Flex>
      </Form>

      <TableView
        aria-label="API tokens"
        selectionMode="none"
        renderEmptyState={() => <Text>You have no API tokens.</Text>}
        minHeight="size-2000"
      >
        <TableHeader>
          <Column key="name">Name</Column>
          <Column key="hint" width={90}>
            Ends in
          </Column>
          <Column key="expires_at">Expires</Column>
          <Column key="last_used_at">Last used</Column>
          <Column key="revoke" width={90}>
            Revoke
          </Column>
        </TableHeader>
        <TableBody items={tokens}>
          {(item) => (
            <Row key={item._id}>
              <Cell>{item.name}</Cell>
              <Cell>…{item.hint}</Cell>
              <Cell>{formatDate(item.expires_at)}</Cell>
              <Cell>{formatDate(item.last_used_at)}</Cell>
              <Cell>
                <DialogTrigger>
                  <Button aria-label={`Revoke ${item.name}`} variant="negative">
                    <Delete />
                  </Button>
                  {(close) => (
                    <Dialog>
                      <Heading>Revoke API token</Heading>
                      <Divider />
                      <Content>
                        Revoke <strong>{item.name}</strong>? Scripts that use it
                        stop working.
                      </Content>
                      <ButtonGroup>
                        <Button variant="secondary" onPress={close}>
                          Cancel
                        </Button>
                        <Button
                          variant="negative"
                          onPress={() => revokeToken(item._id, close)}
                        >
                          Revoke
                        </Button>
                      </ButtonGroup>
                    </Dialog>
                  )}
                </DialogTrigger>
              </Cell>
            </Row>
          )}
        </TableBody>
      </TableView>
    </Flex>
  );
}
