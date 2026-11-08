# Multi-Panel Labelling

A multi-panel project shows many views of one shot on one page. For example, a page can show radial profiles, a spectrogram, time series signals and video together.

The project configuration sets the panels. Each panel shows one view type and a list of signals. The annotators do not change the panels.

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
4. Set **Task** to `multi-panel`. The layout editor shows below the form.
5. Set the data sources:
    1. For each source, type a **Source name** and select a **Data loader**.
    2. To add a source, click **Add source**.
    3. To remove a source, click the delete button of that source.
6. Set the panels:
    1. For each panel, type a unique **Panel id**. The **Title** is optional.
    2. Select the **Kind** of the panel.
    3. Select the **Source** of the panel.
    4. Type the signal names. Use a comma between two names.
    5. Set the grid position of the panel. **Column** and **Row** start at 1. **Width** and **Height** are the number of grid cells that the panel uses.
    6. To add a panel, click **Add panel**.
7. Select **Link the time axes of all panels** to zoom and pan all time axes together. This option is on by default.
8. Click **Create**.

TokTagger checks the layout before it saves the project. Each panel id must be unique. Each panel must use a data source that exists.

### Edit the layout as JSON

For a large layout, you can paste the configuration as JSON.

1. Open **Edit as JSON**.
2. Paste or edit the configuration.
3. Click **Apply JSON**.

Example:

```json
{
  "sources": [
    { "name": "signals", "data_loader": "uda" },
    { "name": "camera", "data_loader": "uda_camera" }
  ],
  "layout": {
    "link_time": true,
    "panels": [
      {
        "id": "radial",
        "kind": "radial_profile",
        "source": "signals",
        "profile_signals": ["ayc_te", "ayc_ne"],
        "time_series_signals": ["ip"],
        "grid": { "col": 1, "row": 1 }
      },
      {
        "id": "spectrogram",
        "kind": "profile_2d",
        "source": "signals",
        "signal": "xmo_omaha",
        "grid": { "col": 2, "row": 1 }
      },
      {
        "id": "traces",
        "kind": "time_series",
        "source": "signals",
        "signals": ["ip", "ane_density"],
        "grid": { "col": 1, "row": 2, "col_span": 2 }
      },
      {
        "id": "video",
        "kind": "video",
        "source": "camera",
        "grid": { "col": 3, "row": 1, "row_span": 2 }
      }
    ]
  }
}
```

You can also send the same `sources` and `layout` fields in the body of `POST /projects`.

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

- The page shows the panels in a grid.
- Click a panel to make it the active panel. The active panel has a blue border.
- The toolbar shows the shot labels, the tools of the active panel, and the model tools.
- When you zoom or pan the time axis of a panel, the other time axes move to the same time range. This applies only when **Link the time axes of all panels** is on.
- Time regions and time points show on all panels that have a time axis.
- An annotation that has a signal name shows only on the panels for that signal.
- **Save** saves the annotations of all panels.

## Limits

- The video panel does not follow the time cursor of the other panels.
- ML models do not support multi-panel projects.
