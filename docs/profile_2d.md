# 2D Profile Labelling Interface

The 2D profile labelling interface is designed for interactive annotation and analysis of two-dimensional tokamak diagnostic data, such as spectrograms, time-frequency representations, or other spatiotemporal measurements. This interface enables you to visualize 2D data as heatmaps, create various types of annotations, and analyze patterns across time and spatial dimensions.

## Overview


<figure markdown="span">
   ![2D Profile Interface](assets/profile-2d.png)
  <figcaption>The 2D profile labelling interface showing heatmap and integrated plots with annotations.</figcaption>
</figure>

The 2D profile view displays diagnostic data as a heatmap with time on the horizontal axis and a spatial dimension (e.g., frequency, radius, or position) on the vertical axis. An integrated time series plot below the heatmap shows the sum of values across the spatial dimension, helping identify temporal patterns and events.

## Interface Components

### Plot Area

The main visualization consists of two vertically stacked plots:

- **Heatmap Plot (Top)**: Displays the 2D data with color intensity representing signal amplitude or power. The color scale automatically adjusts based on the data range and can be toggled between linear and logarithmic scaling.
- **Integrated Plot (Bottom)**: Shows the time-integrated values, summed over the spatial dimension. This 1D plot helps identify significant temporal events that may be less obvious in the 2D view.

Both plots share a common time axis, enabling synchronized navigation and analysis.

### Color Scale

The heatmap uses a continuous color scale to represent data values. The colorbar on the right side shows the mapping between colors and values:

- **Linear Scale**: Direct mapping of data values to colors
- **Logarithmic Scale**: Useful for data spanning multiple orders of magnitude, with enhanced visibility of low-amplitude features

**Available Colormaps:**

- Cividis (default)
- Viridis
- Plasma
- Inferno
- Magma

### View Parameters

Access view parameters from the toolbar on the left:

- **Signal Selection**: Choose which diagnostic signal to display when multiple signals are available
- **Log Scale Toggle**: Switch between linear and logarithmic color scaling for better visualization of different dynamic ranges

### Navigation Controls

In the top left of the interface, you'll find navigation controls to move through your dataset:

- **Annotations Validated / Not Validated**: Shows whether the annotations on this sample have been checked and saved. Saving marks the sample as validated, and Clear marks it as not validated
- **Save Button**: Save your current annotations. A project is collaborative, so the save applies your edits to the annotations of other users, and it also removes the annotations of other users that you deleted
- **Previous Button** (◄): Navigate to the previous sample in your project
- **Next Button** (►): Navigate to the next sample in your project
- **Clear Button**: Remove the annotations from the current sample, and mark the sample as not validated. If **Show Others' Annotations** is selected, the button removes all annotations, including the annotations of other users. If it is not selected, the button removes only your own annotations. The annotations are removed from the database the next time you save, including through Save on Navigate
- **Save On Navigate**: Whether to automatically save any annotations to the database when you move to a different sample
- **Show Others' Annotations**: Whether to show the annotations that other users made. TokTagger keeps this setting for each project
- **Jump to Shot**: Jump to a sample with a given shot ID

**Keyboard Shortcuts:**

- `Shift + ←`: Navigate to previous sample
- `Shift + →`: Navigate to next sample

### Plot Toolbar

The Plotly toolbar at the top of the plot provides navigation tools:

- **Zoom**: Box zoom to a region of interest
- **Box Select**: Click and drag to select multiple annotations within a region (Edit mode only)
- **Pan**: Click and drag to pan the view (the default drag mode)
- **Autoscale**: Zoom out to show all data
- **Reset axes**: Return to the initial view
- **Download plot**: Export the current view as an image

Annotations are drawn with the annotation toolbar described below rather than
Plotly's own shape tools, so no draw or erase shape buttons appear here.

### Annotation Toolbar

The annotation toolbar sits to the right of the plot and drives all annotation
creation:

1. Use the top button to switch between **edit mode** and **view mode**. Press
   `e` to toggle quickly.
2. Activate the desired tool from the list of buttons, then use the dropdown that
   appears to select the label to apply.
3. With a tool active, add annotations using **ctrl+drag** on the plot.

Bounding boxes and polygons are restricted to the heatmap, since their vertical
extent is only meaningful against the heatmap's axis.

Annotations can only be created, selected, moved or deleted in edit mode. In view
mode you can still zoom and pan freely without accidentally changing an annotation.
Switching back to view mode clears any selection.

### Annotations Table

<figure markdown="span">
   ![2D Profile Annotations Table](assets/profile-2d-annotations-table.png){ width="700" }
  <figcaption>The annotations table, listing each annotation on the current sample.</figcaption>
</figure>

Below the plot, the annotations table lists every annotation on the current sample. Each row shows a marker in the annotation's colour, its class label, its type (time region, time point, bounding box or polygon) and who created it - `manual` for an annotation drawn by hand, or the name of the automated annotator or ML model that created it.

- **Click on a row** to move the plot to that annotation. In Edit mode, this also selects the annotation. Selecting annotations on the plot highlights their rows in the table.
- **Delete annotation** (bin icon): Delete that annotation. Deleting requires Edit mode.

## Creating Annotations

TokTagger supports multiple annotation types for 2D profile data, each suited to different labeling tasks:

### Time Regions (Zones)

Time regions are vertical bands that mark time intervals of interest. They span the full spatial dimension and are ideal for labeling extended events or operational phases.

**To create a time region:**

1. Enter edit mode and activate the **TIME REGION** tool
2. Choose a label from the dropdown
3. Ctrl+drag horizontally across the plot to span the interval

**Visual appearance:** Time regions appear as semi-transparent colored vertical bands spanning the full height of the heatmap.

**Available categories:** configured per project (see [Creating Projects](creating_projects.md)) - the list below is an example.

- ELM (Edge Localized Mode)
- L-mode (Low confinement mode)
- H-mode (High confinement mode)
- Thermal Quench
- Current Quench
- Sawtooth
- IRE (Internal Reconnection Event)
- Locked Mode
- VDE (Vertical Displacement Event)
- Unknown

### Time Points (VSpans)

Time points are vertical lines marking specific moments in time. They are useful for identifying instantaneous events or transitions.

**To create a time point:**

1. Enter edit mode and activate the **TIME POINT** tool
2. Choose a label from the dropdown
3. Ctrl+click at the moment of interest

**Visual appearance:** Time points appear as vertical colored lines extending through the entire heatmap.

**Available categories:** configured per project - the list below is an example.

- Disruption
- Thermal Quench
- Current Quench
- Control Loss

### Bounding Boxes

Bounding boxes are rectangular regions that mark specific areas in both time and spatial dimensions. They are ideal for identifying localized features or events.

**To create a bounding box:**

1. Enter edit mode and activate the **BOUNDING BOX** tool
2. Choose a label from the dropdown
3. Ctrl+drag on the heatmap to define the rectangular region

**Visual appearance:** Bounding boxes appear as semi-transparent colored rectangles with visible borders.

**Editing bounding boxes:**

- **Move**: Click and drag the rectangle to reposition it
- **Resize**: Click and drag any edge of the rectangle to adjust its size
- **Delete**: Right-click the annotation and choose "Delete", or select it and
  press `Delete`

### Polygons

Polygons allow you to create freeform closed shapes to annotate irregular features or complex spatial patterns.

**To create a polygon:**

1. Enter edit mode and activate the **POLYGON** tool
2. Choose a label from the dropdown
3. Hold ctrl and click on the heatmap to place each vertex
4. Click near the starting vertex, or double-click, to close the polygon

Press `Esc` to abandon a polygon part way through drawing it.

**Visual appearance:** Polygons appear as semi-transparent colored closed shapes following your drawn path.

**Editing polygons:**

- **Move**: Click and drag the polygon to reposition it
- **Reshape**: Click and drag individual vertices to adjust the shape
- **Add a vertex**: Click on an edge to add a new vertex at its midpoint
- **Remove a vertex**: Press `Delete` while dragging the vertex. A polygon must
  keep at least three vertices
- **Delete**: Right-click the annotation and choose "Delete", or select it and
  press `Delete`

### Thresholded Regions

The thresholding tool generates polygon annotations automatically, outlining the
regions whose values exceed a chosen percentile.

**To generate them:**

1. Open the "Threshold" panel in the left toolbar
2. Enable the tool with the **Thresholding** switch
3. Adjust the parameters (see
   [Automated Annotation Tools](#automated-annotation-tools) below)

Results refresh automatically whenever a parameter changes - there is no apply
step. The heatmap is faded while the tool is active so the generated outlines
stand out against the data.

**Visual appearance:** The regions appear as ordinary polygon annotations, and can
be edited, relabelled and deleted exactly like hand-drawn ones.

## Modifying Annotations

All of the actions below require edit mode.

### Selecting Annotations

- **Click** on any annotation to select it
- **Box Select**: enable the toolbar's Box Select tool, then drag a box to select multiple annotations at once
- **Click on a row** in the annotations table to select that annotation
- Selected annotations can be modified or deleted
- Right-click on any annotation to access its context menu

### Moving and Resizing

**Drawing-based annotations (Polygons and Bounding Boxes):**

- Click and drag to move the entire shape
- Click and drag vertices or handles to reshape
- These annotations are drawn as a D3 overlay on top of the plot, and are shared
  with the time series interface

**Time regions and time points:**

- Click and drag to reposition along the time axis
- For time regions, drag the edges to adjust the start or end time

### Changing Categories

To change the category of an existing annotation:

1. Right-click on the annotation to open its context menu
2. Select "Set type" and choose the new category

If you right-click on a selected annotation, the new category is applied to every selected annotation of the same type.

### Deleting Annotations

To remove an annotation, do one of the following:

- Right-click on the annotation and select "Delete" from the context menu. If the annotation is selected, every selected annotation is deleted
- Select one or more annotations and press `Delete` or `Backspace`
- Click the bin icon on the annotation's row in the annotations table

## Plot Interaction

### Zooming and Panning

The 2D profile plot supports rich interactive exploration:

- **Box Zoom**: Click the zoom button in the toolbar, then click and drag to select a region to zoom into
- **Pan**: Click the pan button in the toolbar, then click and drag to pan the view
- **Scroll Zoom**: Enabled - the mouse wheel zooms the time axis. The heatmap's
  vertical axis is fixed, so the wheel only changes the time range
- **Reset View**: Click "Reset axes" or "Autoscale" in the toolbar, or double-click the plot, to return to the initial view

### Color Scale Adjustment

- **Linear vs. Log Scale**: Toggle between linear and logarithmic color scaling using the switch in the View Parameters panel
- **Colormap Selection**: Choose from different colormaps in the Color Map panel of the left toolbar
- **Automatic Range**: The color scale automatically adjusts to the data range

### Working with the Integrated Plot

The bottom integrated plot provides a 1D time series view:

- Helps identify significant events by showing temporal patterns
- Shares the same time axis as the heatmap for easy correlation
- Updates automatically when zooming or panning the time axis

## Automated Annotation Tools

### Thresholding Tool

The thresholding tool automatically identifies regions in your 2D data that exceed specified intensity criteria. This is particularly useful for:

- Detecting edge localized modes (ELMs) in tokamak spectrograms
- Identifying bursts, instabilities, or other high-intensity events
- Creating initial annotations for further manual refinement

**Parameters:**

- **Percentile**: Sets the intensity threshold as a percentile of the data
  distribution (e.g. 95 means the top 5% of values)
- **Range of Interest**: Restricts analysis to a range of the second dimension,
  useful for excluding noise or irrelevant regions
- **Sigma**: Controls Gaussian smoothing to reduce noise before thresholding
- **Min Size**: Filters out detected regions smaller than this many pixels
- **Vertical Line Filter Width**: Subtracts a rolling mean along the second
  dimension, suppressing broad features so narrow ones stand out. Set to 0 to
  disable

**Workflow:**

1. Load your data sample
2. Open the Threshold panel in the left toolbar and enable it
3. Adjust the parameters and watch the outlines update on the heatmap
4. Review and manually edit the generated polygons if needed
5. Save to keep them

**Note:** Re-running replaces only this tool's own unsaved output for the current
signal. Annotations you drew yourself, results you have already saved, and
annotations belonging to other signals are all left untouched. Turning the tool
off discards its unsaved output but keeps anything saved.
