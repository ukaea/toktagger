import { Flex, Header, Text, View } from "@adobe/react-spectrum";
import LockClosed from "@spectrum-icons/workflow/LockClosed";

/** Shown when the server answers 403: the resource exists, but this account has no
 * access to it. Kept separate from ErrorView so a missing project reads as
 * "not found" and an unauthorised one reads as "not yours".
 */
export default function ForbiddenView({ message }: { message?: string }) {
  return (
    <View width="100%">
      <Flex
        direction="column"
        gap="size-200"
        alignItems="center"
        marginTop="size-500"
      >
        <Header>
          <span style={{ fontSize: "15pt" }}>403 - Forbidden</span>
        </Header>
        <View marginBottom="size-200">
          <LockClosed aria-hidden="true" size="XXL" />
        </View>
        <Text
          maxWidth="500px"
          UNSAFE_style={{ color: "#666", textAlign: "center" }}
        >
          {message ||
            "You do not have access to this project. Ask a project admin to add you as a member."}
        </Text>
      </Flex>
    </View>
  );
}
