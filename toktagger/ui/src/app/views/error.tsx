import { Flex, Header, View } from "@adobe/react-spectrum";

export default function ErrorView({ message }: { message?: string }) {
  return (
    <View>
      <Flex
        direction="column"
        gap="size-200"
        alignItems="center"
        marginTop="size-500"
      >
        <Header>
          <span style={{ fontSize: "15pt" }}>Error</span>
        </Header>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>⚠️</div>
        <p style={{ color: "#666", maxWidth: "500px", textAlign: "center" }}>
          {message || "An unexpected error occurred. Please try again later."}
        </p>
      </Flex>
    </View>
  );
}
