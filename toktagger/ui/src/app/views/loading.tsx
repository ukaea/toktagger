import { Flex, Header, ProgressCircle, View } from "@adobe/react-spectrum";

export default function LoadingView() {
  return (
    <View>
      <Flex
        direction="column"
        gap="size-200"
        alignItems="center"
        marginTop="size-500"
      >
        <Header>
          <span style={{ fontSize: "15pt" }}>Loading Data</span>
        </Header>
        <ProgressCircle
          size="L"
          isIndeterminate={true}
          aria-label="Loading data"
        />
        <p style={{ color: "#666", maxWidth: "500px", textAlign: "center" }}>
          Please wait while the data is being loaded...
        </p>
      </Flex>
    </View>
  );
}
