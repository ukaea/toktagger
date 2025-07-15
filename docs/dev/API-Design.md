# API Endpoints

## `/projects`
- **GET**: Get a list of all projects
- **POST**: Create a new project

## `/projects/{project_id}`
- **GET**: Get info about the given project
- **PUT**: Update the current project
- **DELETE**: Delete the current project

## `/projects/{project_id}/samples`
- **GET**: Get info about which samples are being investigated in this project (which pulses etc)
- **PUT**: Add extra samples to this project
- **DELETE**: Remove samples from this project

## `/projects/{project_id}/samples/next`
- **GET**: Get the next shot which needs annotations, ie the one which is most uncertain from the model or fallback predictions

## `/projects/{project_id}/samples/{sample_id}/data?{params}`
**GET**: Get data required for visualising this task for this shot (params could be eg frame number, or channel, etc)
**PUT**: Add data for this sample
**DELETE**: Delete data for this sample

## `/projects/{project_id}/annotations?{filters}`
- **GET**: Tell me information about annotations available for all shots, ie {shot_id : which type(s) of annotation we have available - human, model, fallback)
- **DELETE**: Delete ALL human annotations for ALL shots

## `/projects/{project_id}/samples/{sample_id}/annotations`
- **GET**: Tell me the annotations already stored for this shot (either from human, model, or fallback strategy, in that order)
- **PUT**: Add human annotations for this shot
- **DELETE**: Delete human annotations for this shot

## `/projects/{project_id}/annotator/`
- **GET**: Get a list of all annotators available for this task

## `/projects/{project_id}/samples/{sample_id}/annotator/{annotator_id}?{params}`
- **GET**: Get suggested annotations for this sample (doesn't get put into DB)

## `/projects/{project_id}/models/`
- **GET**: Get a list of all models available for this task

## `/projects/{project_id}/models/{model_id}`
- **GET**: Get statistics about this model (latest version, accuracy, link so mlflow/simvue storage, etc)
- **DELETE**: Delete this model

## `/projects/{project_id}//models/{model_id}/train`
- **GET**: Current status of training
- **PUT**: Retrain model with new data
- **DELETE**: Cancel training

## `/projects/{project_id}/models/{model_id}/predict?{filters}`
  (filters here might be a single shot ID, a range of shots, or a number of shots to sample at random...)

- **POST**: Create predictions using specified model on shots specified by filters
- **GET**: Retrieve predictions from specified model on shot(s) specified by filters
- **DELETE**: Delete predictions using specified model on shots specified by filters

## `/projects/{project_id}/models/{model_id}/evaluate?{filters}`
- **GET**: Returns statistics about how the predictions from the model compare to the human annotations for the shot(s) specified by filters

# Usage
You could have one database per tokamak, one collection per shot, one document per event
The document might look something like this?

```json
{
  "elms": {
    "annotations": {
      "regions": [...]
    },
    "predictions": {
      "model_1": {
        "1.0.0": {
          "regions": [...],
          "confidence": 0.52
        },
        "2.0.0": {
          "regions": [...],
          "confidence": 0.68
        },
      }
      "model_2": {
        "1.0.0": {
          "regions": [...],
          "confidence": 0.83
        }
      }
    …
}
```

Possibly the versioning here is not necessary, but might be nice to record how the confidence across different versions of the model is changing...

Rough program flow:

1. User loads webpage, UI queries `/projects` endpoint, displays clickable list of projects
3. User chooses a project, UI loads next pulse by doing GET to `/projects[{project_id}/annotations/next`, this uses the querying strategy to find the next item to annotate, returns the relevant shot ID and predicted data
4. UI queries the `/projects/{project_id}/data?{shot_id}` endpoint with that shot ID, gets back data required to plot, plots data and predictions together
5. User changes predictions if required and presses save, UI PUTs to `/projects/{project_id}/annotations?{shot_id}'`endpoint with that shot ID
6. After a few labels, user (or UI automatically?) triggers retraining, PUTs to `/projects/{project_id}/model/train`.
7. User can also request info about a specific shot using a GET to `/projects/{project_id}/annotations?{shot_id}`


1. The user might want to designate an evaluation set of images? ie they could go through a set of however many random pulses and the UI does GETs to `/projects/}{project_id}/annotations?{shot_id}` and `/projects/{project_id}/data?{shot_id}` for each. If they tick a ‘evalauation set’ tickbox on the UI,then when it does a PUT to `/projects/{project_id}/annotations?{shot_id}` it passes in a ‘evaluation=True’ parameter in the request body. This is then saved in the database and these pulses arent used in the training set. 

2. User could then do `/projects[{project_id}/model/evaluate`  to compare predictions against this pulse using the model with human annotations and get statistics from it

3. User could also want to see predictions vs human annotations and statistics about a specific pulse or group of pulses. So would do…
    1. `/annotions?{shot_id}` to add ‘unbiased’ human annotations
    2. `/predictions?{shot_id}` to get model predictions
    3. `/evaluate?{shot_id}` to compare the above and get statistics