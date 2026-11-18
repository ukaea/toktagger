"use client";
import {
  Form,
  Button,
  ActionButton,
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
  RadioGroup,
  Radio,
  ContextualHelp,
} from "@adobe/react-spectrum";
import {
  Project,
  Sample,
  ShotData,
  FileData,
  TimeSeriesFileData,
  ImageArrayFileData,
} from "@/types";
import AddCircle from "@spectrum-icons/workflow/AddCircle";
import { useState, useEffect } from "react";
import { z } from "zod/v4";
import * as d3 from "d3";
import { BACKEND_API_URL, apiFetch } from "@/app/core";
import NumericalRange, {
  NumericalRangeType,
} from "@/app/components/ui/numerical_range";

// Pydantic writes a single-value Literal as "const" rather than "enum"
const FileTypeSchema = z.object({
  properties: z.object({
    type: z.union([
      z.object({ enum: z.array(z.string()).min(1) }),
      z.object({ const: z.string() }),
    ]),
  }),
});

const DEFAULT_SIGNAL_NAME_HELP =
  "Use the signal names that the data loader expects.";

const SignalNameHelp = ({ helpText }: { helpText: string | null }) => (
  <ContextualHelp>
    <Heading>Signal names</Heading>
    <Content>
      <Text>
        {helpText ?? DEFAULT_SIGNAL_NAME_HELP} Refer to the Data Loaders
        documentation for examples.
      </Text>
    </Content>
  </ContextualHelp>
);

export const AddSamplesEditor = ({
  project,
  onModify,
  // Which samples a project holds is project configuration, so only a project
  // admin may add them - mirrors require_project_admin_role on POST /samples.
  canManageSamples = true,
}: {
  project: Project;
  onModify?: () => void;
  canManageSamples?: boolean;
}) => {
  const dataLoader = project.data_loader;

  // Data schema state
  const [dataSchema, setDataSchema] = useState<Record<string, unknown> | null>(
    null,
  );
  const [fileTypes, setFileTypes] = useState<{ key: string; value: string }[]>(
    [],
  );
  const [signalNameHelp, setSignalNameHelp] = useState<string | null>(null);

  // Form state
  const [shotInputMethod, setShotInputMethod] = useState<string>("range"); // "range" or "file"
  const [shotRange, setShotRange] = useState<NumericalRangeType>();
  const [shotIds, setShotIds] = useState<number[]>([]);
  const [shotFileNames, setShotFileNames] = useState<Map<number, string>>(
    new Map(),
  );

  // Shot Data fields
  const [signalNames, setSignalNames] = useState<string>("");

  // File Data fields
  const [fileType, setFileType] = useState<string>("parquet");
  const [dirPath, setDirPath] = useState<string>("");
  const [columnNames, setColumnNames] = useState<string>(""); // For time series files

  // Determine if we should use directories (for image data)
  const useDirectories = dataSchema?.title === "ImageFileData";
  const isTimeSeriesFile =
    dataSchema?.title === "TimeSeriesFileData" ||
    dataSchema?.title === "DefuseFileData";
  const isFileData =
    isTimeSeriesFile ||
    dataSchema?.title === "ImageFileData" ||
    dataSchema?.title === "ImageArrayFileData";

  // Fetch the data schema type from the load registry
  useEffect(() => {
    async function fetchDataSchema() {
      try {
        const response = await apiFetch(
          `${BACKEND_API_URL}/meta/dataloader/${dataLoader}`,
        );
        if (response.ok) {
          const schema = await response.json();
          // The schema has a "title" field that indicates the type
          // e.g., "ShotData", "FileData", "TimeSeriesFileData"
          setDataSchema(schema);

          const helpResponse = await apiFetch(
            `${BACKEND_API_URL}/meta/dataloader/${dataLoader}/help`,
          );
          const helpText = z
            .string()
            .nullable()
            .safeParse(helpResponse.ok ? await helpResponse.json() : null);
          setSignalNameHelp(helpText.success ? helpText.data : null);

          if (schema.title === "ShotData") {
            return;
          }

          const fileTypeSchema = FileTypeSchema.safeParse(schema);
          if (!fileTypeSchema.success) {
            ToastQueue.negative(`No file types found for ${dataLoader}.`, {
              timeout: 3000,
            });
            return;
          }
          const typeProperty = fileTypeSchema.data.properties.type;
          const fileTypes =
            "enum" in typeProperty ? typeProperty.enum : [typeProperty.const];
          setFileTypes(
            fileTypes.map((ft) => ({
              key: ft,
              value: ft.toUpperCase(),
            })),
          );
          setFileType((current) =>
            fileTypes.includes(current) ? current : fileTypes[0],
          );
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
    if (shotInputMethod === "range") {
      setShotIds(
        Array.from(
          { length: (shotRange?.max ?? 0) - (shotRange?.min ?? 0) + 1 },
          (_, i) => i + (shotRange?.min ?? 0),
        ),
      );
    }
  }, [shotRange, shotInputMethod]);

  // Read and parse CSV file when selected
  const handleFileSelect = (files: FileList | null) => {
    if (files && files.length > 0) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          // Parse CSV properly so quoted fields containing newlines stay in one row
          const rows = d3
            .csvParseRows(content)
            .filter((row) => row.some((cell) => cell.trim()));
          if (rows.length <= 1) {
            ToastQueue.negative("CSV file is empty or has no data rows", {
              timeout: 3000,
            });
            return;
          }
          // Skip header (index 0), take the first column of remaining rows
          const ids = rows
            .slice(1)
            .map((row) => row[0].trim())
            .filter((firstColumn) => /^\d+$/.test(firstColumn))
            .map((firstColumn) => parseInt(firstColumn, 10));

          if (ids.length === 0) {
            ToastQueue.negative("No valid shot IDs found in first column", {
              timeout: 3000,
            });
          } else {
            setShotIds(ids);
            ToastQueue.positive(`Loaded ${ids.length} shot IDs from CSV`, {
              timeout: 3000,
            });
          }
        } catch (error) {
          ToastQueue.negative(`Error parsing CSV file: ${error}`, {
            timeout: 3000,
          });
        }
      };
      reader.onerror = () => {
        ToastQueue.negative("Error reading file", { timeout: 3000 });
      };
      reader.readAsText(file);
    }
  };

  useEffect(() => {
    async function fetchFileSamples() {
      let apiUrl = `${BACKEND_API_URL}/paths/files?dir_path=${dirPath}&file_type=${fileType}`;
      if (useDirectories) {
        apiUrl = `${BACKEND_API_URL}/paths/directories?dir_path=${dirPath}&file_type=${fileType}`;
      }
      const response = await apiFetch(apiUrl);

      if (response.ok) {
        const result = await response.json();
        const fileNames: string[] = result;

        // Shot ID is the trailing number of the file name, e.g. MASTUno48264.h5 -> 48264
        const regex = useDirectories
          ? /^(\d+)$/
          : new RegExp(`(\\d+)\\.${fileType}$`);
        const extractedFileNames = new Map<number, string>();
        for (const fileName of fileNames) {
          const match = fileName.split("/").pop()?.match(regex);
          if (match) {
            extractedFileNames.set(parseInt(match[1], 10), fileName);
          }
        }

        setShotFileNames(extractedFileNames);
        setShotIds([...extractedFileNames.keys()]);
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

        if (dataSchema?.title === "ShotData") {
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
        } else if (isFileData) {
          const fileName =
            shotFileNames.get(shotId) ??
            (useDirectories
              ? `${dirPath}/${shotId}`
              : `${dirPath}/${shotId}.${fileType}`);

          const fileData: Record<string, string | string[]> = {
            file_name: fileName,
            type: fileType,
            protocol: "file",
          };

          // Add column_names for time series file data
          if (columnNames.trim()) {
            const columns = columnNames
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);

            if (isTimeSeriesFile && columns.length > 0) {
              fileData.signal_names = columns;
              return {
                ...baseSample,
                data: fileData as TimeSeriesFileData,
              };
            } else if (
              dataSchema?.title === "ImageArrayFileData" &&
              columns.length > 1
            ) {
              throw new Error(
                "Only one signal name allowed for image array data!",
              );
            } else if (
              dataSchema?.title === "ImageArrayFileData" &&
              columns.length == 1
            ) {
              fileData.signal_name = columns[0];
              return {
                ...baseSample,
                data: fileData as ImageArrayFileData,
              };
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
      const response = await apiFetch(
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

  useEffect(() => {
    setShotIds([]);
    setShotFileNames(new Map());
  }, [dataSchema, shotInputMethod]);

  return (
    <DialogTrigger>
      <ActionButton isQuiet isDisabled={!canManageSamples}>
        <AddCircle />
        <Text>Add Samples</Text>
      </ActionButton>
      {(close) => (
        <Dialog>
          <Heading>Add Samples to Project</Heading>
          <Divider />
          <Content>
            {/* Display data type info from schema */}
            {dataSchema && (
              <Text>
                Data Type: <strong>{dataSchema.title}</strong> (from{" "}
                {dataLoader} data loader)
              </Text>
            )}

            {/* Conditional fields based on data schema type */}
            {dataSchema?.title === "ShotData" && (
              <Form maxWidth="size-6000">
                <TextField
                  label="Signal Names"
                  isRequired
                  value={signalNames}
                  onChange={setSignalNames}
                  description="Comma-separated list of signals to load."
                  contextualHelp={<SignalNameHelp helpText={signalNameHelp} />}
                />
                <RadioGroup
                  label="Shot ID Input Method"
                  value={shotInputMethod}
                  onChange={setShotInputMethod}
                >
                  <Radio value="range">Numerical Range</Radio>
                  <Radio value="file">Text File</Radio>
                </RadioGroup>

                {shotInputMethod === "range" ? (
                  <NumericalRange
                    label="Shot"
                    isRequired
                    onChange={setShotRange}
                    maximumFractionDigits={0}
                    rangeMin={0}
                  />
                ) : (
                  <></>
                )}

                {shotInputMethod === "file" ? (
                  <Flex direction="column" gap="size-100">
                    <input
                      type="file"
                      accept=".txt,.csv"
                      onChange={(e) => handleFileSelect(e.target.files)}
                      style={{
                        padding: "8px",
                        border: "1px solid #ccc",
                        borderRadius: "4px",
                      }}
                    />
                    <Text>
                      Upload a CSV file with shot IDs in the first column
                      (header row will be skipped)
                    </Text>
                    {shotIds.length > 0 && (
                      <Text>
                        Loaded <strong>{shotIds.length}</strong> shot IDs:{" "}
                        {shotIds.slice(0, 5).join(", ")}
                        {shotIds.length > 5 &&
                          ` ... and ${shotIds.length - 5} more`}
                      </Text>
                    )}
                  </Flex>
                ) : (
                  <></>
                )}
              </Form>
            )}

            {isFileData && (
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
            {isFileData && shotIds.length > 0 ? (
              <Text>
                Found <strong>{shotIds.length}</strong>{" "}
                {useDirectories ? "directories" : "files"} with shot IDs:{" "}
                {shotIds.slice(0, 5).join(", ")}
                {shotIds.length > 5 && ` ... and ${shotIds.length - 5} more`}
              </Text>
            ) : (
              <Text>
                No files found for the specified directory and file type.
              </Text>
            )}

            {(isTimeSeriesFile ||
              dataSchema?.title === "ImageArrayFileData") && (
              <Form maxWidth="size-6000">
                <TextField
                  label={
                    isTimeSeriesFile
                      ? "Signal Names (comma-separated)"
                      : "Signal Name"
                  }
                  value={columnNames}
                  onChange={setColumnNames}
                  description="Optional: Specify signal names to load data for."
                  contextualHelp={<SignalNameHelp helpText={signalNameHelp} />}
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
