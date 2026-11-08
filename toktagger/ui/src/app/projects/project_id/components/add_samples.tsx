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
  RadioGroup,
  Radio,
  View,
} from "@adobe/react-spectrum";
import {
  DataSource,
  DEFAULT_SOURCE,
  Project,
  Sample,
  SampleData,
  TaskType,
} from "@/types";
import AddCircle from "@spectrum-icons/workflow/AddCircle";
import { useState, useEffect, useCallback } from "react";
import { BACKEND_API_URL } from "@/app/core";
import NumericalRange, {
  NumericalRangeType,
} from "@/app/components/ui/numerical_range";

const FILE_SCHEMAS = [
  "ImageFileData",
  "ImageArrayFileData",
  "TimeSeriesFileData",
] as const;
type FileSchemaTitle = (typeof FILE_SCHEMAS)[number];

const isFileSchema = (title: unknown): title is FileSchemaTitle =>
  FILE_SCHEMAS.some((fileSchema) => fileSchema === title);

// What the user entered for one data source.
type SourceInput =
  | { kind: "shot"; signalNames: string }
  | {
      kind: "file";
      schemaTitle: FileSchemaTitle;
      fileType: string;
      dirPath: string;
      columnNames: string;
      shotIds: number[];
    };

const splitNames = (text: string) =>
  text
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

/** Builds the sample data of one source for one shot. */
function buildSourceData(input: SourceInput, shotId: number): SampleData {
  if (input.kind === "shot") {
    const signals = splitNames(input.signalNames);
    if (signals.length === 0) {
      throw new Error("At least one signal name is required for Shot Data");
    }
    return { protocol: "uda", signal_names: signals };
  }

  // For image directories, the "file name" is the directory of the shot.
  const fileName =
    input.schemaTitle === "ImageFileData"
      ? `${input.dirPath}/${shotId}`
      : `${input.dirPath}/${shotId}.${input.fileType}`;
  const fileData = {
    file_name: fileName,
    type: input.fileType,
    protocol: "file",
  };
  const columns = splitNames(input.columnNames);

  if (input.schemaTitle === "TimeSeriesFileData" && columns.length > 0) {
    return { ...fileData, signal_names: columns };
  }
  if (input.schemaTitle === "ImageArrayFileData" && columns.length > 1) {
    throw new Error("Only one signal name allowed for image array data!");
  }
  if (input.schemaTitle === "ImageArrayFileData" && columns.length === 1) {
    return { ...fileData, signal_name: columns[0] };
  }
  return fileData;
}

/** The fields for one data source; reports its input to the parent on each change. */
function SourceInputGroup({
  source,
  showName,
  onChange,
}: {
  source: DataSource;
  showName: boolean;
  onChange: (sourceName: string, input: SourceInput | null) => void;
}) {
  const dataLoader = source.data_loader;
  const [schemaTitle, setSchemaTitle] = useState<string | null>(null);
  const [fileTypes, setFileTypes] = useState<{ key: string; value: string }[]>(
    [],
  );
  const [signalNames, setSignalNames] = useState<string>("");
  const [fileType, setFileType] = useState<string>("parquet");
  const [dirPath, setDirPath] = useState<string>("");
  const [columnNames, setColumnNames] = useState<string>("");
  const [shotIds, setShotIds] = useState<number[]>([]);

  const useDirectories = schemaTitle === "ImageFileData";

  // Fetch the data schema type from the load registry
  useEffect(() => {
    async function fetchDataSchema() {
      try {
        const response = await fetch(
          `${BACKEND_API_URL}/meta/dataloader/${dataLoader}`,
        );
        if (response.ok) {
          const schema = await response.json();
          setSchemaTitle(schema.title);

          if (schema.title === "ShotData") {
            return;
          }

          const fileTypes = schema.properties.type.enum;
          setFileTypes(
            fileTypes.map((ft: string) => ({
              key: ft,
              value: ft.toUpperCase(),
            })),
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
    if (!isFileSchema(schemaTitle)) return;
    async function fetchFileSamples() {
      let apiUrl = `${BACKEND_API_URL}/paths/files?dir_path=${dirPath}&file_type=${fileType}`;
      if (useDirectories) {
        apiUrl = `${BACKEND_API_URL}/paths/directories?dir_path=${dirPath}&file_type=${fileType}`;
      }
      const response = await fetch(apiUrl);

      if (response.ok) {
        const fileNames: string[] = await response.json();

        // Extract shot IDs from file names using regex (assuming shot ID is a number in the file name)
        const extractedShotIds = fileNames
          .map((fileName) => {
            const regex = useDirectories
              ? /^\d+$/
              : new RegExp(`^\\d+\\.${fileType}$`);

            const match = fileName.split("/").pop()?.match(regex);
            return match ? parseInt(match[0], 10) : null;
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
  }, [dirPath, fileType, useDirectories, schemaTitle]);

  useEffect(() => {
    if (schemaTitle === "ShotData") {
      onChange(source.name, { kind: "shot", signalNames });
    } else if (isFileSchema(schemaTitle)) {
      onChange(source.name, {
        kind: "file",
        schemaTitle,
        fileType,
        dirPath,
        columnNames,
        shotIds,
      });
    } else {
      onChange(source.name, null);
    }
  }, [
    onChange,
    source.name,
    schemaTitle,
    signalNames,
    fileType,
    dirPath,
    columnNames,
    shotIds,
  ]);

  return (
    <View
      borderWidth={showName ? "thin" : undefined}
      borderColor="gray-300"
      borderRadius="medium"
      padding={showName ? "size-100" : undefined}
      marginBottom="size-100"
      aria-label={`Source ${source.name}`}
    >
      {schemaTitle && (
        <Text>
          {showName && (
            <>
              Source: <strong>{source.name}</strong>.{" "}
            </>
          )}
          Data Type: <strong>{schemaTitle}</strong> (from {dataLoader} data
          loader)
        </Text>
      )}

      {schemaTitle === "ShotData" && (
        <Form maxWidth="size-6000">
          <TextField
            label="Signal Names"
            isRequired
            value={signalNames}
            onChange={setSignalNames}
            description="Signal names to load as a comma-separated list, e.g., ip, dalpha, ANE_DENSITY"
          />
        </Form>
      )}

      {isFileSchema(schemaTitle) && (
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

          <TextField
            label={"Directory Path"}
            isRequired
            value={dirPath}
            onChange={setDirPath}
            description={"Path to directory containing data files"}
          />

          {schemaTitle !== "ImageFileData" ? (
            <TextField
              label={
                schemaTitle === "TimeSeriesFileData"
                  ? "Signal Names (comma-separated)"
                  : "Signal Name"
              }
              value={columnNames}
              onChange={setColumnNames}
              description="Optional: Specify signal names to load data for."
            />
          ) : (
            <></>
          )}
        </Form>
      )}

      {isFileSchema(schemaTitle) &&
        (shotIds.length > 0 ? (
          <Text>
            Found <strong>{shotIds.length}</strong>{" "}
            {useDirectories ? "directories" : "files"} with shot IDs:{" "}
            {shotIds.slice(0, 5).join(", ")}
            {shotIds.length > 5 && ` ... and ${shotIds.length - 5} more`}
          </Text>
        ) : (
          <Text>No files found for the specified directory and file type.</Text>
        ))}
    </View>
  );
}

export const AddSamplesEditor = ({
  project,
  onModify,
}: {
  project: Project;
  onModify?: () => void;
}) => {
  const isMultiPanel = project.task === TaskType.MultiPanel;
  const sources: DataSource[] =
    project.sources.length > 0
      ? project.sources
      : [{ name: DEFAULT_SOURCE, data_loader: project.data_loader }];

  const [inputs, setInputs] = useState<Record<string, SourceInput | null>>({});
  const [shotInputMethod, setShotInputMethod] = useState<string>("range"); // "range" or "file"
  const [shotRange, setShotRange] = useState<NumericalRangeType>();
  const [manualShotIds, setManualShotIds] = useState<number[]>([]);

  const setSourceInput = useCallback(
    (sourceName: string, input: SourceInput | null) =>
      setInputs((previous) => ({ ...previous, [sourceName]: input })),
    [],
  );

  const sourceInputs = sources.map((source) => inputs[source.name] ?? null);
  const fileInputs = sourceInputs.filter(
    (input): input is Extract<SourceInput, { kind: "file" }> =>
      input?.kind === "file",
  );
  // File sources decide the shots: a shot is added only when every file source has it.
  const usesFiles = fileInputs.length > 0;
  const shotIds = usesFiles
    ? fileInputs
        .slice(1)
        .reduce(
          (common, input) => common.filter((id) => input.shotIds.includes(id)),
          fileInputs[0].shotIds,
        )
    : manualShotIds;

  useEffect(() => {
    if (shotInputMethod === "range") {
      setManualShotIds(
        Array.from(
          { length: (shotRange?.max ?? 0) - (shotRange?.min ?? 0) + 1 },
          (_, i) => i + (shotRange?.min ?? 0),
        ),
      );
    } else {
      setManualShotIds([]);
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
          // Parse CSV: split by lines, skip header (first line), get first column
          const lines = content.split(/\r?\n/).filter((line) => line.trim());
          if (lines.length <= 1) {
            ToastQueue.negative("CSV file is empty or has no data rows", {
              timeout: 3000,
            });
            return;
          }
          // Skip header (index 0), parse remaining lines
          const ids = lines
            .slice(1)
            .map((line) => {
              // Get first column (split by comma, take first element)
              const firstColumn = line.split(",")[0].trim();
              return parseInt(firstColumn, 10);
            })
            .filter((id) => !isNaN(id));

          if (ids.length === 0) {
            ToastQueue.negative("No valid shot IDs found in first column", {
              timeout: 3000,
            });
          } else {
            setManualShotIds(ids);
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

  const onFormSubmit = async (close: () => void) => {
    try {
      const missing = sources.find((source) => !inputs[source.name]);
      if (missing) {
        throw new Error(`No data type is known for source '${missing.name}'`);
      }

      const samples: Partial<Sample>[] = shotIds.map((shotId) => {
        const baseSample = {
          shot_id: shotId,
          timestamp: new Date().toISOString(),
        };
        if (!isMultiPanel) {
          const input = inputs[sources[0].name];
          return input
            ? { ...baseSample, data: buildSourceData(input, shotId) }
            : baseSample;
        }
        return {
          ...baseSample,
          sources: Object.fromEntries(
            sources.flatMap((source) => {
              const input = inputs[source.name];
              return input
                ? [[source.name, buildSourceData(input, shotId)]]
                : [];
            }),
          ),
        };
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

  const allSourcesKnown = sourceInputs.every((input) => input !== null);

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
            {sources.map((source) => (
              <SourceInputGroup
                key={source.name}
                source={source}
                showName={sources.length > 1}
                onChange={setSourceInput}
              />
            ))}

            {allSourcesKnown && !usesFiles && (
              <Form maxWidth="size-6000">
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
                    {manualShotIds.length > 0 && (
                      <Text>
                        Loaded <strong>{manualShotIds.length}</strong> shot IDs:{" "}
                        {manualShotIds.slice(0, 5).join(", ")}
                        {manualShotIds.length > 5 &&
                          ` ... and ${manualShotIds.length - 5} more`}
                      </Text>
                    )}
                  </Flex>
                )}
              </Form>
            )}

            {usesFiles && fileInputs.length > 1 && (
              <Text>
                <strong>{shotIds.length}</strong> shot IDs are found in every
                file source.
              </Text>
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
