import pathlib
import typing

import pydantic
from platformdirs import user_cache_dir
from pydantic_settings import (
    BaseSettings,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
    TomlConfigSettingsSource,
)


class UDA(pydantic.BaseModel):
    host: str = pydantic.Field(
        "uda2.mast.l",
        description="Host name for the UDA server to connect to for MAST data loaders.",
    )
    meta_pluginname: str = pydantic.Field(
        "MASTU_DB",
        description="Database location for MAST-U data",
    )
    metanew_pluginname: str = pydantic.Field(
        "MAST_DB",
        description="Database location for MAST data",
    )


class SAL(pydantic.BaseModel):
    host: str = pydantic.Field(
        "https://sal.jetdata.eu",
        description="URL for the SAL server to connect to for JET data loaders.",
    )


class Database(pydantic.BaseModel):
    mongo_url: str = pydantic.Field(
        "./toktagger_db",
        description="URL of the MongoDB server to connect to as a backend. If not set, uses a local mongita client.",
    )


class Auth(pydantic.BaseModel):
    secret_key: str | None = pydantic.Field(
        None,
        description="Secret key used to sign auth tokens. If unset, a key is generated and persisted to secret.key under the server cache_dir on first run. Set this explicitly for multi-worker/multi-process deployments so all processes share the same signing key.",
    )
    cookie_name: str = pydantic.Field(
        "tt_access_token",
        description="Name of the httpOnly cookie holding the session token. Set to __Host-tt_access_token on an HTTPS-only deployment for extra hardening.",
    )
    cookie_secure: bool | None = pydantic.Field(
        None,
        description="Whether to mark the auth cookie Secure (HTTPS only). If unset, it is derived from the scheme of the login request, so local HTTP development works and an HTTPS deployment is hardened automatically. Set this explicitly to true when TLS is terminated by a proxy on a different host, where the forwarded scheme is not visible to the server.",
    )
    cookie_samesite: typing.Literal["lax", "strict", "none"] = pydantic.Field(
        "lax",
        description="SameSite policy for the auth cookie. Only use none if the frontend is served from a different site to the API; this also forces the cookie to be Secure.",
    )
    provider: typing.Literal["canaille", "oidc"] = pydantic.Field(
        "canaille",
        description="Identity provider. canaille starts and manages a local Canaille OpenID Connect server for you. oidc uses an external provider (for example Keycloak) set by issuer_url, client_id and client_secret.",
    )
    issuer_url: str | None = pydantic.Field(
        None,
        description="Issuer URL of the OpenID Connect provider. Required when provider is oidc. It must be the same URL for the browser and for the TokTagger server. Set automatically when provider is canaille.",
    )
    client_id: str = pydantic.Field(
        "toktagger",
        description="OpenID Connect client ID registered for TokTagger at the provider.",
    )
    client_secret: str | None = pydantic.Field(
        None,
        description="OpenID Connect client secret. Required when provider is oidc. Generated and stored automatically when provider is canaille.",
    )
    scopes: str = pydantic.Field(
        "openid profile email",
        description="Space-separated OpenID Connect scopes to request. Add the scope that makes the provider return the roles_claim if it needs one (for example groups for Canaille).",
    )
    roles_claim: str = pydantic.Field(
        "groups",
        description="Dotted path to the claim with the user's groups or roles, for example groups or realm_access.roles. The claim can be a list or a single string.",
    )
    admin_group: str = pydantic.Field(
        "toktagger-admins",
        description="Value in roles_claim that gives a user the global admin role. The role is set again from the provider at every sign-in.",
    )
    public_url: str | None = pydantic.Field(
        None,
        description="URL at which users reach TokTagger, used for the OpenID Connect redirect URI. If unset, it is http://<server.host>:<server.port>.",
    )
    verify_bearer_audience: bool = pydantic.Field(
        True,
        description="Whether to require the client_id in the audience of provider access tokens sent as Bearer tokens.",
    )
    canaille_port: int = pydantic.Field(
        8003,
        description="Port for the managed Canaille server. Only used when provider is canaille.",
    )
    canaille_public_url: str | None = pydantic.Field(
        None,
        description="URL at which the browser reaches the managed Canaille server, and the issuer URL. If unset, it is http://<server.host>:<canaille_port>. Only used when provider is canaille.",
    )
    canaille_bootstrap_password: str | None = pydantic.Field(
        None,
        description="Password for the first Canaille admin user. If unset, a random password is generated and printed at first start. Only used when provider is canaille.",
    )

    @pydantic.model_validator(mode="after")
    def _require_oidc_settings(self) -> typing.Self:
        if self.provider == "oidc":
            missing = [
                f"auth.{name}"
                for name in ("issuer_url", "client_secret")
                if not getattr(self, name)
            ]
            if missing:
                raise ValueError(
                    f"{' and '.join(missing)} must be set when auth.provider is 'oidc'"
                )
        return self


class Server(pydantic.BaseModel):
    host: str = pydantic.Field(
        "localhost",
        description="Address of the host to launch TokTagger on.",
    )
    port: int = pydantic.Field(
        8002,
        description="The port to use for the TokTagger Rest API.",
    )
    reload: bool = pydantic.Field(
        False,
        description="Whether to hot reload the TokTagger server on changes to files.",
    )
    workers: int = pydantic.Field(
        1,
        description="The number of Gunicorn worker processes to use. If set to 1, runs a single-process uvicorn server instead.",
        gt=0,
    )
    cache_dir: pathlib.Path = pydantic.Field(
        user_cache_dir("toktagger", "ukaea"),
        description="The directory to use for storing entries in the Mongita database, if used.",
        validate_default=True,
    )
    cors_origins: list[str] = pydantic.Field(
        ["http://localhost:5173"],
        description="Origins allowed to make cross-origin requests to the API, for example the frontend dev server. Set to an empty list when the frontend is served by TokTagger itself.",
    )


class Models(pydantic.BaseModel):
    cache_dir: pathlib.Path = pydantic.Field(
        pathlib.Path(user_cache_dir("toktagger", "ukaea")).joinpath("models"),
        description="The directory to use for storing ML model weights.",
        validate_default=True,
    )
    max_actors: typing.Annotated[
        int | None,
        pydantic.Field(
            default=5,
            description="The maximum number of ML models which can be loaded concurrently, set to None to detect automatically and use all available cores.",
            gt=0,
        ),
    ]
    max_gpu_actors: typing.Annotated[
        int | None,
        pydantic.Field(
            default=None,
            description="The maximum number of GPUs to use for ML model tasks, leave blank to detect automatically and use all available cores.",
            gt=0,
        ),
    ]
    force_num_gpus: bool = pydantic.Field(
        False,
        description="Force the set number of GPU actors available, even if insufficient available GPU cores detected on hardware.",
    )
    load_safetensors_only: bool = pydantic.Field(
        False,
        description="Whether to only allow loading of SafeTensors files for added security.",
    )
    local_load_enabled: bool = pydantic.Field(
        True,
        description="Whether to enable the loading of model weights files from local disk. Should be disabled for production servers.",
    )
    gitlab_load_enabled: bool = pydantic.Field(
        True,
        description="Whether to enable the loading of model weights files from Gitlab.",
    )
    gitlab_url: str | None = pydantic.Field(
        None, description="The URL of the Gitlab server to load ML model weights from."
    )
    gitlab_token: str | None = pydantic.Field(
        None,
        description="The PAT Token to use when connecting to Gitlab to load model weights.",
    )
    gitlab_project_id: int | None = pydantic.Field(
        None,
        description="Limit the user to load ML model weights from a specific Gitlab project. Leave blank to allow the user to choose.",
    )
    huggingface_load_enabled: bool = pydantic.Field(
        True,
        description="Whether to enable the loading of model weights files from Hugging Face.",
    )
    huggingface_userspace: str | None = pydantic.Field(
        None,
        description="Limit the user to load ML model weights from a specific Hugging Face userspace / organisation. Leave blank to allow the user to choose.",
    )


class Settings(BaseSettings):
    # Note if adding extra settings to this object, all sections should have one level of nesting only
    # Ie, everything inside Settings should point to a BaseModel as a default factory
    # And everything inside that BaseModel should be a flat field, not another BaseModel
    # This is because more indentation would make the environment variables unintuitive,
    # As they would not be able to just use single underscores (since different levels of nesting requires a different delimiter)
    server: Server = pydantic.Field(default_factory=Server)
    database: Database = pydantic.Field(default_factory=Database)
    auth: Auth = pydantic.Field(default_factory=Auth)
    uda: UDA = pydantic.Field(default_factory=UDA)
    sal: SAL = pydantic.Field(default_factory=SAL)
    models: Models = pydantic.Field(default_factory=Models)

    model_config = SettingsConfigDict(
        toml_file="toktagger.toml",
        env_nested_delimiter="_",
        env_nested_max_split=1,
    )

    @property
    def public_url(self) -> str:
        url = self.auth.public_url or f"http://{self.server.host}:{self.server.port}"
        return url.rstrip("/")

    @property
    def canaille_public_url(self) -> str:
        url = (
            self.auth.canaille_public_url
            or f"http://{self.server.host}:{self.auth.canaille_port}"
        )
        return url.rstrip("/")

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        return (
            init_settings,
            env_settings,
            TomlConfigSettingsSource(settings_cls),
            dotenv_settings,
        )


settings = Settings()
