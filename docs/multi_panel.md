# Multi-Panel Labelling

A multi-panel project shows many views of one shot on one page. For example, a page can show radial profiles, a spectrogram, time series signals and video together.

The project configuration sets the tabs and the panels. Each tab has a title and a grid of panels. Each panel shows one view type and a list of signals. The annotators do not change the tabs or the panels.

## Tabs

A project can have one or more tabs. Use tabs to put many panels on different pages of one shot. For example, a "Profiles" tab can show the Thomson profiles and a "Camera" tab can show the video.

- Each tab has a title. You can use any text, but each title must be unique in the project.
- Each tab has its own grid. The **Column** and **Row** of a panel are the position in the grid of its tab.
- Each panel id must be unique in all the tabs of the project.
- If the project has only one tab, the page does not show the tab bar.
- TokTagger draws the plots of a tab when you open the tab for the first time. When you go back to a tab, its plots show immediately and keep their zoom.
- If the layout has `panels` and no `tabs`, TokTagger makes one tab with the title `Main`. Thus, a layout from an earlier version of TokTagger continues to work.

## Panel types

| Kind | View | Signal fields |
|---|---|---|
| `time_series` | Time series signals on one shared time axis. Refer to [Time Series Labelling](time_series.md). | `signals`: one or more signal names. |
| `profile_2d` | A 2D signal, for example a spectrogram, as a heatmap against time. Refer to [2D Profile Labelling](profile_2d.md). | `signal`: one signal name. |
| `radial_profile` | Radial profiles and time series signals. Refer to [Radial Profile Labelling](radial_profile.md). | `profile_signals`: one or more profile names. `time_series_signals`: zero or more signal names. |
| `video` | Camera frames. Refer to [Video Labelling](video.md). | `signal`: the camera signal name. This field is optional. |

## Data sources

A data source is a named data loader. Each panel uses one data source. A project can have more than one data source. For example:

- A `uda` source for the time series signals.
- A `uda_camera` source for the video.
- A `fair_mast` source for files from the [FAIR-MAST](https://mastapp.site/) data repository.

If you do not add data sources, the project has one source. Its name is `default` and it uses the project data loader.

A panel loads only its own signals from its data source. Thus, many panels can use the same file.

## Create a multi-panel project

1. Go to the **Projects** page.
2. Click **Create Project**.
3. Type a **Project Name**.
4. Set **Task** to `multi-panel`. The layout editor shows below the form. It has two tabs: **YAML** and **Form**. The two tabs edit the same configuration.
5. Write the data sources, the tabs and the panels. Use the **YAML** tab or the **Form** tab. Refer to [Edit the layout as YAML](#edit-the-layout-as-yaml) and [Edit the layout with the form](#edit-the-layout-with-the-form).
6. Click **Create**.

TokTagger checks the layout before it saves the project:

- Each data source name must be unique.
- Each tab title must be unique.
- Each panel id must be unique in all the tabs.
- Each panel must use a data source that exists.

If the layout has an error, the editor shows the error below the text and you cannot create the project.

### Layout preview

The **UI Preview** area is next to the layout editor. It shows a diagram of the sample page for the current layout.

- The preview has a tab bar with the title of each tab, as on the sample page. Click a title to see the panels of that tab. When the layout has only one tab, the preview does not show the tab bar.
- Each box is one panel, at its position on the grid. The box shows the panel title (or the panel id), the kind of panel, the data loader and the data source. The colour of the box shows the kind of panel.
- The preview changes when you change the **YAML** tab or the **Form** tab. When the text has an error, the preview shows the last layout that had no error.
- When two panels on one tab use the same grid cell, the two boxes have a red dashed border, and a warning shows below the preview. The warning names the tab, also when the preview shows a different tab. The warning does not stop you from saving the project, but the panels cover each other on the sample page.

### Edit the layout as YAML

The **YAML** tab shows the configuration as YAML text. A new project starts with an example that has comments. The comments tell you the fields of each panel.

- When you type, TokTagger checks the text. For a YAML syntax error, the message shows the line and the column. For other errors, the message shows the path of the incorrect field, for example `layout.tabs[1].panels[0].signals`.
- TokTagger keeps the text that you write, with its comments. When you edit the project, the **YAML** tab shows the same text.
- To use a YAML file from your computer, click **Load file**.
- To save the text to a file, click **Download**.

Example:

```yaml
# Sources and layout of the shot review page.
sources:
  - name: signals
    data_loader: uda
  - name: camera
    data_loader: uda_camera
layout:
  # Zoom and pan all the time axes together.
  link_time: true
  tabs:
    - title: Overview
      panels:
        - id: radial
          kind: radial_profile
          source: signals
          profile_signals: [ayc_te, ayc_ne]
          time_series_signals: [ip]
          grid: { col: 1, row: 1 }
        - id: spectrogram
          kind: profile_2d
          source: signals
          signal: xmo_omaha
          grid: { col: 2, row: 1 }
        - id: traces
          kind: time_series
          source: signals
          signals: [ip, ane_density]
          grid: { col: 1, row: 2, col_span: 2 }
    - title: Camera
      panels:
        - id: video
          kind: video
          source: camera
```

The `grid` fields are optional. `col` and `row` start at 1, and `col_span` and `row_span` are 1 if you do not set them.

You can also send the YAML text in the `layout_yaml` field of the body of `POST /projects`. When `layout_yaml` is set, TokTagger reads the `sources` and the `layout` from it. Alternatively, send the `sources` and `layout` fields as JSON.

### Edit the layout with the form

1. Open the **Form** tab.
2. Set the data sources:
    1. For each source, type a **Source name** and select a **Data loader**.
    2. To add a source, click **Add source**.
    3. To remove a source, click the delete button of that source.
3. Set the tabs:
    1. For each tab, type a **Tab title**.
    2. To add a tab, click **Add tab**.
    3. To remove a tab, click the delete button of that tab.
4. Set the panels of each tab:
    1. For each panel, type a unique **Panel id**. The **Title** is optional.
    2. Select the **Kind** of the panel.
    3. Select the **Source** of the panel.
    4. Type the signal names. Use a comma between two names.
    5. Set the grid position of the panel. **Column** and **Row** start at 1. **Width** and **Height** are the number of grid cells that the panel uses.
    6. To add a panel to a tab, click **Add panel** in that tab.
5. Select **Link the time axes of all panels** to zoom and pan all time axes together. This option is on by default.

When you change the form, TokTagger writes the YAML text again. The comment lines at the top of the text stay, but other comments are removed.

If the YAML text has an error when you open the **Form** tab, the form does not show. Correct the error in the **YAML** tab first.

## Add samples

1. Open the project.
2. Click **Add Samples**.
3. The dialog shows one input group for each data source. Fill in each group.
4. Set the shots:
    - If one or more sources use files, TokTagger finds the shot IDs from the file names. It adds only the shots that all file sources have.
    - If no source uses files, type a shot range or upload a CSV file of shot IDs.
5. Click **Add Samples**.

TokTagger rejects a sample that does not have data for each data source of the project.

## Label a shot

- The page shows the panels of the selected tab in a grid. If the project has more than one tab, click a tab title to show its panels. The first panel of that tab becomes the active panel. TokTagger remembers the selected tab when you go to the next shot.
- Click a panel to make it the active panel. The active panel has a blue border.
- The toolbar on the left shows the shot labels, the tools of the active panel, and the model tools.
- There is one **Annotation Toolbar** on the right for all panels. Use it to set Edit Mode or View Mode, and to select the annotation tool and label. The mode, the tool and the label apply to all panels. Press **e** to change the mode.
- The **Annotation Toolbar** shows only the tools of the active panel. For example, a time series panel has time points and time regions, and a spectrogram panel also has bounding boxes and polygons. A video panel shows the video tools.
- When you go back to a panel, the toolbar selects the last tool that you used in that panel.
- There is one annotations table below the grid. It shows the annotations of all panels. The **Panel** column shows the panels that show each annotation.
- When you zoom or pan the time axis of a panel, the other time axes move to the same time range. This applies only when **Link the time axes of all panels** is on.
- Time regions and time points show on all panels that have a time axis, on all tabs.
- The time range of the linked time axes stays the same when you change the tab.
- An annotation that has a signal name shows only on the panels for that signal.
- **Save** saves the annotations of all panels.

## Limits

- The video panel does not follow the time cursor of the other panels.
- ML models do not support multi-panel projects.
- When you open a shot, TokTagger loads the data of all the panels, also the panels on the tabs that do not show.
