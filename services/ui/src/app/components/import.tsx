import { Button, FileTrigger, ToastQueue, Text, Flex } from "@adobe/react-spectrum";
import Import from '@spectrum-icons/workflow/Import';
import { importJSONFile } from "../core";

export function ImportTool({ project_id, refreshAnnotations }: { project_id: string; refreshAnnotations?: () => void }) {

  const handleFileChange = (files: FileList | null) => {
    if (files && files.length > 0) {
      const file = files[0];
      try {
        importJSONFile(project_id, file, refreshAnnotations);
        ToastQueue.positive(`Annotations imported successfully from ${file.name}`, {timeout: 5000});
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        ToastQueue.negative(`Error importing annotations: ${errorMessage}`, {timeout: 5000});
      }
    }
  };

  return (
    <>
      <FileTrigger
        onSelect={handleFileChange}
        acceptedFileTypes={['application/json']}>
        <Flex justifyContent="center" alignItems="center">
            <Button variant="primary"><Import /><Text>Import Annotations</Text></Button>
        </Flex>
      </FileTrigger>
    </>
  )
}
