/**
 * The annotations table below the frame, with one row per instance (class label + track ID).
 * It only talks to the session, never to Annotorious directly.
 */
import { useState } from "react";
import {
  ActionButton,
  ActionGroup,
  AlertDialog,
  Button,
  Cell,
  Column,
  DialogContainer,
  Flex,
  Item,
  Key,
  Row,
  Selection,
  TableBody,
  TableHeader,
  TableView,
  Tooltip,
  TooltipTrigger,
} from "@adobe/react-spectrum";
import StepBackward from "@spectrum-icons/workflow/StepBackward";
import Delete from "@spectrum-icons/workflow/Delete";
import ImageMapPolygon from "@spectrum-icons/workflow/ImageMapPolygon";
import ImageMapRectangle from "@spectrum-icons/workflow/ImageMapRectangle";
import Label from "@spectrum-icons/workflow/Label";
import Target from "@spectrum-icons/workflow/Target";
import { useSample } from "@/app/contexts/SampleContext";
import { useVideoUiState } from "@/app/contexts/VideoContext";
import {
  DrawingTool,
  InstanceProfile,
  makeTrackKey,
  VideoAnnotationType,
} from "@/app/video/components/types";
import { useVideoSession } from "@/app/video/components/video-session";
import { canonicalizeTrackId } from "@/app/video/components/video-utils";

const VIDEO_TYPE_ICONS: Record<VideoAnnotationType, typeof ImageMapRectangle> =
  {
    [VideoAnnotationType.BOUNDING_BOX]: ImageMapRectangle,
    [VideoAnnotationType.POLYGON]: ImageMapPolygon,
    [VideoAnnotationType.POINT]: Target,
    [VideoAnnotationType.FRAME_LABEL]: Label,
  };

// The tool that draws each type, so selecting a row can switch to it
const VIDEO_TYPE_TOOLS: Record<VideoAnnotationType, DrawingTool> = {
  [VideoAnnotationType.BOUNDING_BOX]: "rectangle",
  [VideoAnnotationType.POLYGON]: "polygon",
  [VideoAnnotationType.POINT]: "point",
  [VideoAnnotationType.FRAME_LABEL]: "frame",
};

type VideoTableScope = "all" | "frame";

type TableRow = { id: string; instance: InstanceProfile };

type PendingDelete =
  | { kind: "instance"; instance: InstanceProfile }
  | { kind: "all" };

const isTableScope = (key: Key | undefined): key is VideoTableScope =>
  key === "all" || key === "frame";

function deleteDialogText(
  pendingDelete: PendingDelete,
  scope: VideoTableScope,
) {
  if (pendingDelete.kind === "instance") {
    const { className, trackId } = pendingDelete.instance;
    return {
      title: "Delete instance?",
      message: `This deletes all annotations for ${className} / ${trackId} across all frames. You can’t undo this.`,
    };
  }
  return scope === "all"
    ? {
        title: "Clear all frames?",
        message:
          "This will remove all annotations across all frames in the current session. You can’t undo this.",
      }
    : {
        title: "Clear this frame?",
        message:
          "This will remove all annotations on the current frame. You can’t undo this.",
      };
}

type FocusOptions = Parameters<
  ReturnType<typeof useVideoSession>["requestFocusInstance"]
>[2];

/** Selects a row's instance: switches to its tool and track, and selects it on the image if it is there. */
function useSelectInstance() {
  const { setSelection, requestFocusInstance, closePopup, setDrawingTool } =
    useVideoSession();
  const { setVideoLastClassName } = useVideoUiState();

  return (instance: InstanceProfile, focus: FocusOptions) => {
    // Runs first because deselecting (here and in setDrawingTool) resets the session's track id
    closePopup();
    setDrawingTool(VIDEO_TYPE_TOOLS[instance.type]);
    setSelection({
      className: instance.className,
      trackId: canonicalizeTrackId(instance.trackId),
    });
    setVideoLastClassName(instance.className);
    requestFocusInstance(instance.className, instance.trackId, focus);
  };
}

// Separate component because Spectrum caches rows by item, so editMode must be read here to stay fresh
const VideoRowActions = ({
  instance,
  scope,
  onRequestDelete,
}: {
  instance: InstanceProfile;
  scope: VideoTableScope;
  onRequestDelete: (instance: InstanceProfile) => void;
}) => {
  const { editMode, deleteInstanceOnCurrentFrame } = useVideoSession();
  const { setDataParams } = useSample();
  const selectInstance = useSelectInstance();

  const jumpToAnnotation = () => {
    const firstFrame = instance.frames[0];
    setDataParams((prev) => ({ ...prev, name: "image", frame: firstFrame }));
    selectInstance(instance, { targetFrame: firstFrame });
  };

  const deleteAnnotation = () =>
    scope === "frame"
      ? deleteInstanceOnCurrentFrame(instance.className, instance.trackId)
      : onRequestDelete(instance);

  return (
    <>
      <TooltipTrigger delay={350}>
        <ActionButton
          isQuiet
          aria-label="Jump to annotation"
          onPress={jumpToAnnotation}
        >
          <StepBackward />
        </ActionButton>
        <Tooltip>Jump to annotation</Tooltip>
      </TooltipTrigger>
      <TooltipTrigger delay={350}>
        <ActionButton
          isQuiet
          isDisabled={!editMode}
          aria-label="Delete annotation"
          onPress={deleteAnnotation}
        >
          <Delete />
        </ActionButton>
        <Tooltip>Delete annotation</Tooltip>
      </TooltipTrigger>
    </>
  );
};

export const VideoAnnotationsTable = () => {
  const session = useVideoSession();
  const selectInstance = useSelectInstance();
  const [scope, setScope] = useState<VideoTableScope>("all");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null,
  );

  const rows: TableRow[] = session.instances
    .filter(
      (instance) => scope === "all" || instance.frames.includes(session.frame),
    )
    .map((instance) => ({
      id: makeTrackKey(
        instance.className,
        canonicalizeTrackId(instance.trackId),
      ),
      instance,
    }));

  const { className, trackId } = session.selection;
  const selectedKeys =
    className && trackId ? [makeTrackKey(className, trackId)] : [];

  const onSelectionChange = (keys: Selection) => {
    if (keys === "all") return;

    const row = rows.find((candidate) => keys.has(candidate.id));
    // Deselecting a row keeps the class but stops continuing its track
    if (!row) {
      session.setSelection({ className, trackId: null });
      session.closePopup();
      return;
    }

    selectInstance(row.instance, { onlyIfOnCurrentFrame: true });
  };

  const dialogText = pendingDelete && deleteDialogText(pendingDelete, scope);

  const confirmDelete = () => {
    if (pendingDelete?.kind === "instance") {
      session.deleteInstanceAcrossFrames(
        pendingDelete.instance.className,
        pendingDelete.instance.trackId,
      );
    } else if (scope === "all") {
      session.clearAllFrames();
    } else {
      session.clearCurrentFrame();
    }
  };

  return (
    <div className="relative w-[70%] overflow-x-auto shadow-md sm:rounded-lg ml-auto mr-auto p-4">
      <Flex justifyContent="center" marginBottom="size-200">
        <h1 className="text-xl font-bold">Annotations</h1>
      </Flex>
      <Flex
        justifyContent="space-between"
        alignItems="center"
        marginBottom="size-100"
      >
        <ActionGroup
          aria-label="Annotations scope"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[scope]}
          onSelectionChange={(keys) => {
            const key = keys === "all" ? undefined : Array.from(keys)[0];
            if (isTableScope(key)) setScope(key);
          }}
        >
          <Item key="all">All Frames</Item>
          <Item key="frame">This Frame</Item>
        </ActionGroup>
        <Button
          variant="negative"
          style="outline"
          isDisabled={!session.editMode || rows.length === 0}
          onPress={() => setPendingDelete({ kind: "all" })}
        >
          Delete all
        </Button>
      </Flex>
      <TableView
        aria-label="Annotations table"
        width="100%"
        height="200px"
        selectionMode="single"
        selectionStyle="highlight"
        selectedKeys={selectedKeys}
        onSelectionChange={onSelectionChange}
      >
        <TableHeader>
          <Column key="marker" width={56} hideHeader>
            Marker
          </Column>
          <Column key="label">Class Label</Column>
          <Column key="type">Type</Column>
          <Column key="track_id">Track ID</Column>
          <Column key="frame">First Frame</Column>
          <Column key="created_by">Created By</Column>
          <Column key="actions" width={112} hideHeader align="end">
            Actions
          </Column>
        </TableHeader>
        <TableBody items={rows}>
          {({ id, instance }: TableRow) => {
            const Icon = VIDEO_TYPE_ICONS[instance.type];
            return (
              <Row key={id}>
                <Cell>
                  <Flex justifyContent="center">
                    <Icon aria-label={instance.type} size="S" />
                  </Flex>
                </Cell>
                <Cell>{instance.className}</Cell>
                <Cell>{instance.type}</Cell>
                <Cell>{instance.trackId}</Cell>
                <Cell>{instance.frames[0]}</Cell>
                <Cell>{instance.createdBy}</Cell>
                <Cell>
                  <VideoRowActions
                    instance={instance}
                    scope={scope}
                    onRequestDelete={(target) =>
                      setPendingDelete({ kind: "instance", instance: target })
                    }
                  />
                </Cell>
              </Row>
            );
          }}
        </TableBody>
      </TableView>
      <DialogContainer onDismiss={() => setPendingDelete(null)}>
        {dialogText && (
          <AlertDialog
            title={dialogText.title}
            variant="destructive"
            primaryActionLabel="Delete"
            cancelLabel="Cancel"
            onPrimaryAction={confirmDelete}
          >
            {dialogText.message}
          </AlertDialog>
        )}
      </DialogContainer>
    </div>
  );
};
