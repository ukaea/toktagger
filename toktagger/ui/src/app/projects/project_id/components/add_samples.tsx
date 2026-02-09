"use client";
import {
  Form,
  Button,
  DialogTrigger,
  Dialog,
  Divider,
  Heading,
  Content,
  ButtonGroup,
  Text,
  TextField,
  ComboBox,
  Item,
  Flex,
  ToastQueue,
} from "@adobe/react-spectrum";
import { Project, Sample, ShotData, FileData } from "@/types";
import AddCircle from "@spectrum-icons/workflow/AddCircle";
import { useState, useEffect } from "react";
import { BACKEND_API_URL } from "@/app/core";
import NumericalRange, {
  NumericalRangeType,
} from "@/app/components/ui/numerical_range";
import { fi } from "zod/v4/locales";

export const AddSamplesEditor = ({
  project,
  onModify,
}: {
  project: Project;
  onModify?: () => void;
}) => {
  const dataLoader = project.data_loader;

  let fileTypes = [];
  if (dataLoader == "image") {
    fileTypes = [
      { key: "png", value: "PNG" },
      { key: "jpg", value: "JPEG" },
    ];
  } else if (dataLoader == "parquet") {
    fileTypes = [
      { key: "parquet", value: "Parquet" },
      { key: "csv", value: "CSV" },
    ];
  }

  // Data schema state
  const [dataSchemaType, setDataSchemaType] = useState<string | null>(null);

  // Form state
  const [shotRange, setShotRange] = useState<NumericalRangeType>();
  const [shotIds, setShotIds] = useState<number[]>([]);

  // Shot Data fields
  const [signalNames, setSignalNames] = useState<string>("");

  // File Data fields
  const [fileType, setFileType] = useState<string>("parquet");
  const [dirPath, setDirPath] = useState<string>("");
  const [columnNames, setColumnNames] = useState<string>(""); // For time series files

  // Determine if we should use directories (for image data)
  const useDirectories =
    dataSchemaType === "FileData" && (fileType === "png" || fileType === "jpg");

  // Fetch the data schema type from the load registry
  useEffect(() => {
    async function fetchDataSchema() {
      try {
        const response = await fetch(
          `${BACKEND_API_URL}/meta/dataloader/${dataLoader}`,
        );
        if (response.ok) {
          const schema = await response.json();
          // The schema has a "title" field that indicates the type
          // e.g., "ShotData", "FileData", "TimeSeriesFileData"
          setDataSchemaType(schema.title);
        } else {
          ToastQueue.negative(`Error fetching data schema for ${dataLoader}.`, {
            timeout: 3000,
          });
        }
      } catch (error) {
        ToastQueue.negative(`Error fetching data schema: ${error}`, {
          timeout: 3000,
        });
      }
    }
    if (dataLoader) {
      fetchDataSchema();
    }
  }, [dataLoader]);

  useEffect(() => {
    setShotIds(
      Array.from(
        { length: (shotRange?.max ?? 0) - (shotRange?.min ?? 0) + 1 },
        (_, i) => i + (shotRange?.min ?? 0),
      ),
    );
  }, [shotRange]);

  useEffect(() => {
    async function fetchFileSamples() {
      let apiUrl = `${BACKEND_API_URL}/paths/files?dir_path=${dirPath}&file_type=${fileType}`;
      if (useDirectories) {
        apiUrl = `${BACKEND_API_URL}/paths/directories?dir_path=${dirPath}`;
      }
      const response = await fetch(apiUrl);

      if (response.ok) {
        const result = await response.json();
        const fileNames: string[] = result;

        // Extract shot IDs from file names using regex (assuming shot ID is a number in the file name)
        const extractedShotIds = fileNames
          .map((fileName) => {
            const match = fileName.match(/(\d+)/);
            return match ? parseInt(match[1], 10) : null;
          })
          .filter((id): id is number => id !== null);

        setShotIds(extractedShotIds);
      } else {
        ToastQueue.negative(`Error fetching files for ${dirPath}.`, {
          timeout: 3000,
        });
      }
    }
    fetchFileSamples();
  }, [dirPath, fileType, useDirectories]);

  const onFormSubmit = async (close: () => void) => {
    try {
      // Build samples array based on data schema type
      const samples: Partial<Sample>[] = shotIds.map((shotId) => {
        const baseSample = {
          shot_id: shotId,
          timestamp: new Date().toISOString(),
        };

        if (dataSchemaType === "ShotData") {
          // Shot Data
          const signals = signalNames
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);

          if (signals.length === 0) {
            throw new Error(
              "At least one signal name is required for Shot Data",
            );
          }

          return {
            ...baseSample,
            data: {
              protocol: "uda",
              signal_names: signals,
            } as ShotData,
          };
        } else if (
          dataSchemaType === "FileData" ||
          dataSchemaType === "TimeSeriesFileData"
        ) {
          // File Data or Time Series File Data
          let fileName: string =
            dirPath + "/" + (shotId.toString() + "." + fileType); // Default file name format
          if (useDirectories) {
            fileName = dirPath + "/" + shotId.toString(); // For directories, the "file name" is just the directory path with shot ID
          }

          const fileData: Record<string, string | string[]> = {
            file_name: fileName,
            type: fileType,
            protocol: "file",
          };

          // Add column_names for time series file data
          if (dataSchemaType === "TimeSeriesFileData" && columnNames.trim()) {
            const columns = columnNames
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            if (columns.length > 0) {
              fileData.signal_names = columns;
            }
          }

          return {
            ...baseSample,
            data: fileData as FileData,
          };
        }

        return baseSample;
      });

      // POST to API
      const response = await fetch(
        `${BACKEND_API_URL}/projects/${project._id}/samples`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(samples),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Error creating samples");
      }

      const result = await response.json();
      ToastQueue.positive(
        `Successfully created ${result.length || samples.length} sample(s)!`,
        { timeout: 3000 },
      );

      if (onModify) {
        onModify();
      }

      close();
    } catch (error) {
      ToastQueue.negative(`${error}`, { timeout: 3000 });
    }
  };

  return (
    <DialogTrigger>
      <Button variant="primary">
        <AddCircle />
        <Text>Add Samples</Text>
      </Button>
      {(close) => (
        <Dialog>
          <Heading>Add Samples to Project</Heading>
          <Divider />
          <Content>
            {/* Display data type info from schema */}
            {dataSchemaType && (
              <Text>
                Data Type: <strong>{dataSchemaType}</strong> (from {dataLoader}{" "}
                data loader)
              </Text>
            )}

            {/* Conditional fields based on data schema type */}
            {dataSchemaType === "ShotData" && (
              <Form maxWidth="size-6000">
                <TextField
                  label="Signal Names"
                  isRequired
                  value={signalNames}
                  onChange={setSignalNames}
                  description="Signal names to load as a comma-separated list, e.g., ip, dalpha, ANE_DENSITY"
                />
                <NumericalRange
                  label="Shot"
                  isRequired
                  onChange={setShotRange}
                />
              </Form>
            )}

            {(dataSchemaType === "FileData" ||
              dataSchemaType === "TimeSeriesFileData") && (
              <Form maxWidth="size-6000">
                <ComboBox
                  label="File Type"
                  items={fileTypes}
                  isRequired
                  selectedKey={fileType}
                  onSelectionChange={(key) =>
                    setFileType(key ? String(key) : "parquet")
                  }
                  description="File extension to filter for. For directory paths, only files with this extension will be included."
                >
                  {(item: Record<string, string>) => (
                    <Item key={item.key}>{item.value}</Item>
                  )}
                </ComboBox>

                <Flex direction="row" gap="size-200" alignItems="end">
                  <TextField
                    label={"Directory Path"}
                    isRequired
                    flex={1}
                    value={dirPath}
                    onChange={setDirPath}
                    description={"Path to directory containing data files"}
                  />
                </Flex>
              </Form>
            )}

            {/* Display found shot IDs */}
            {(dataSchemaType === "FileData" ||
              dataSchemaType === "TimeSeriesFileData") &&
              shotIds.length > 0 && (
                <Text>
                  Found <strong>{shotIds.length}</strong>{" "}
                  {useDirectories ? "directories" : "files"} with shot IDs:{" "}
                  {shotIds.slice(0, 5).join(", ")}
                  {shotIds.length > 5 && ` ... and ${shotIds.length - 5} more`}
                </Text>
              )}

            {dataSchemaType === "TimeSeriesFileData" && (
              <Form maxWidth="size-6000">
                <TextField
                  label="Column Names (comma-separated)"
                  value={columnNames}
                  onChange={setColumnNames}
                  description="Optional: Specify column names for time series data"
                />
              </Form>
            )}
          </Content>
          <ButtonGroup>
            <Button variant="secondary" onPress={close}>
              Cancel
            </Button>
            <Button variant="primary" onPress={async () => onFormSubmit(close)}>
              Add Samples
            </Button>
          </ButtonGroup>
        </Dialog>
      )}
    </DialogTrigger>
  );
};
