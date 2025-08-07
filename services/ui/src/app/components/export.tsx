import { Text, Button, Flex, Item, ComboBox, ContextualHelp, Content} from '@adobe/react-spectrum'
import { useState } from 'react';
import { getAnnotations, getAnnotationsForSample } from '../core';
import { saveJSONToFile } from '../utils';
import { Annotations, Project, Sample } from '@/types';

type ExportToolInfo = {
  project: Project;
  sample: Sample;
  current_annotations: Annotations;
};
export function ExportTool({ project, sample, current_annotations }: ExportToolInfo) {
    const exportItems = ['All', 'Current Sample'].map((item) => ({ id: item, name: item }));
    const [exportOption, setExportOption] = useState<string>('All');

    const handleExport = () => {
        if (exportOption === 'All') {
            getAnnotations(project._id).then((annotations) => {
                saveJSONToFile(annotations, `${project.name}_annotations.json`);
            });
        } else {
            saveJSONToFile(current_annotations, `${project.name}_${sample.shot_id}_annotations.json`);
        }
    };

    return (
        <div className='m-4'>
            <Flex direction="column">
                <Flex direction="row" alignItems="center" gap="size-100">
                    <ComboBox label='Export' defaultSelectedKey={exportOption}defaultItems={exportItems} onInputChange={setExportOption}>
                        {(item: { id: string; name: string }) => <Item>{item.name}</Item>}
                    </ComboBox>
                    <ContextualHelp placement='top'>
                        <Content>
                            <Text>Export annotations for either all samples in the project or the current sample being displayed.</Text>
                        </Content>
                    </ContextualHelp>
                </Flex>
                <br/>
                <Button variant='primary' onPress={handleExport}><Text>Export</Text></Button>
            </Flex>
        </div>
    );
}