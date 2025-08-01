# API Endpoints
Below is a brief outline of the design of the backend API and what each endpoint does. For full documentation of these endpoints, launch the application and go to `http://localhost:8002/docs`.

## `/projects`
- **GET**: Get a list of all available projects
- **POST**: Create a new project

## `/projects/{project_id}`
- **GET**: Get a single project using its ID
- **PUT**: Update a project using its ID
- **DELETE**: Delete a project using its ID

## `/projects/{project_id}/samples`
- **GET**: Get info about which samples are being investigated in this project (which pulses etc)
- **PUT**: Add extra samples to this project
- **DELETE**: Remove samples from this project

## `/projects/{project_id}/samples/next`
- **GET**: Get the next shot which needs annotations, ie the one which is most uncertain from the model or fallback predictions

## `/projects/{project_id}/samples/{sample_id}/data?{params}`
**GET**: Get data required for visualising this task for this shot (params could be eg frame number, or channel, etc)
**PUT**: Add data for this sample (not implemented)
**DELETE**: Delete data for this sample (not implemented)

## `/projects/{project_id}/annotations?{filters}`
- **GET**: Tell me information about annotations available for this project
- **DELETE**: Delete ALL annotations for ALL samples for this project

## `/projects/{project_id}/samples/{sample_id}/annotations`
- **GET**: Tell me the annotations already stored for this sample
- **PUT**: Add human annotations for this sample
- **DELETE**: Delete annotations for this sample

## `/projects/{project_id}/annotator/`
- **GET**: Get a list of all annotators available for this task (not implemented)

## `/projects/{project_id}/samples/{sample_id}/annotator/{annotator_id}?{params}`
- **GET**: Get suggested annotations for this sample (doesn't get put into DB)

## `/projects/{project_id}/models/`
- **GET**: Get a list of models trained for this project

## `/projects/{project_id}/models/{model_type}`
- **GET**: Get information about a specific model (eg accuracy, path to saved weights, etc)
- **DELETE**: Delete this model

## `/projects/{project_id}//models/{model_type}/train`
- **GET**: Current status of training for this model
- **PUT**: Retrain model with new data
- **DELETE**: Cancel training (not implemented)

## `/projects/{project_id}/models/{model_type}/predict?{filters}`
  (filters here might be a single shot ID, a range of shots, or a number of shots to sample at random...)

- **POST**: Create predictions using specified model on shots specified by filters
- **DELETE**: Delete predictions using specified model on shots specified by filters

## `/projects/{project_id}/sampels/{sample_id}/models/{model_type}/predict?{filters}`
- **POST**: Get modle predictions for this sample - blocking endpoint

## `/projects/{project_id}/models/{model_type}/evaluate?{filters}`
- **GET**: Returns statistics about how the predictions from the model compare to the human annotations for the shot(s) specified by filters (not implemented)

# Database
The rest API connects to a MongoDB database on the backend to store results. There are four collections:

      * Projects
      * Samples
      * Annotations
      * Models

When an endpoint is called which creates a new entry in any of these collections, a new JSON document is added according to a Pydantic schema which defines the expected fields. These documents are linked by storing the relevant IDs to other documents in the other collections - eg if a new Sample is added to a certain project, the Sample document will be given a `"project_id": ObjectID(...)` which links it back tot he correct document in the Projects collection.
```

# Program flow:

1. User loads webpage, UI queries `/projects` endpoint, displays clickable list of projects
2. User selects a project, UI queries `/projects{project_id}/samples` and displays a list of clickable samples
3. User selects a sample to load, UI queries:
      * `/projects{project_id}/samples/{sample_id}/data` to get the data to display to the user
      * `/projects/{project_id}/samples/{sample_id}/annotations` to get any annotations from the DB to plot over the data
4. If the user wishes to use an annotator or model to make automated predictions, UI queries `/projects/{project_id}/samples/{sample_id}/annotators/{annotator_type}` and/or `/projects/{project_id}/samples/{sample_id}/models/{model_type}` and gets back predictions to also plot over the data
5. User changes predictions if required and presses save, UI PUTs to `/projects/{project_id}/samples/{sample_id}/annotations`endpoint with that sample ID
6. User presses Next, UI queries `/projects/{project_id}/samples/{next` which uses the Query Strategy for the project (random, uncertainty, sequential etc) to pick the next sample to annotate. This returns a sample, the UI loops back to step 3.
7. After a few labels, user (or UI automatically?) triggers retraining, PUTs to `/projects/{project_id}/model/{model_type}/train`.
8. Once trained, the model can be used to make batch predictions on unannotated samples by doing a POST to `/projects/{project_id}/model/{model_type}/predict`

The following are unimplemented currently, but are potential future work:

1. The user might want to designate an evaluation set of images? ie they could go through a set of however many random pulses and the UI does GETs to `/projects/}{project_id}/annotations?{shot_id}` and `/projects/{project_id}/data?{shot_id}` for each. If they tick a ‘evalauation set’ tickbox on the UI,then when it does a PUT to `/projects/{project_id}/annotations?{shot_id}` it passes in a ‘evaluation=True’ parameter in the request body. This is then saved in the database and these pulses arent used in the training set. 

2. User could then do `/projects/{project_id}/model/evaluate`  to compare predictions against this pulse using the model with human annotations and get statistics from it

3. User could also want to see predictions vs human annotations and statistics about a specific pulse or group of pulses. So would do…
    1. `/annotions?{shot_id}` to add ‘unbiased’ human annotations
    2. `/predictions?{shot_id}` to get model predictions
    3. `/evaluate?{shot_id}` to compare the above and get statistics