"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, TextField, Flex } from "@adobe/react-spectrum";

type ShotInputProps = {
  endpoint: string;
};

export default function ShotInput({ endpoint }: ShotInputProps) {
  const router = useRouter();
  const [shotId, setShotId] = useState("");

  const handleSubmit = () => {
    if (shotId) {
      router.push(`/${endpoint}/${shotId}`);
    }
  };

  return (
    <div>
      <h1>Enter a shot ID</h1>
      <Flex gap="size-100" alignItems="end">
        <TextField
          type="number"
          value={shotId}
          onChange={setShotId}
          placeholder="Shot ID..."
          isRequired
          label="Shot ID"
          width="100%"
        />
        <Button variant="accent" onPress={handleSubmit} isDisabled={!shotId}>
          Go
        </Button>
      </Flex>
    </div>
  );
}
