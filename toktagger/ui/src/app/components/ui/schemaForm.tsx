"use client";

import Form from "@rjsf/core";
import { RJSFSchema } from "@rjsf/utils";
import validator from "@rjsf/validator-ajv8";
import { useEffect, useRef, forwardRef } from "react";
import {
  TextField,
  NumberField,
  Checkbox,
  CheckboxGroup,
  ComboBox,
  Item,
  RadioGroup,
  Radio,
  TextArea,
  DatePicker,
  FileTrigger,
  Text,
  Slider,
  Button,
  Provider,
  defaultTheme,
  View,
  Heading,
  InlineAlert,
  Content,
} from "@adobe/react-spectrum";
import {
  WidgetProps,
  FieldTemplateProps,
  ArrayFieldTemplateProps,
  TitleFieldProps,
  ErrorListProps,
  RJSFValidationError,
} from "@rjsf/utils";
import { getDefaultRegistry, IChangeEvent } from "@rjsf/core";
import { getSchemaType } from "@rjsf/utils";

export function SpectrumBaseWidget(props: WidgetProps) {
  const {
    id,
    label,
    value,
    required,
    disabled,
    readonly,
    onChange,
    onBlur,
    onFocus,
    schema,
    rawErrors,
    placeholder,
  } = props;

  const type = getSchemaType(schema);

  if ((type && type === "number") || type === "integer") {
    return (
      <NumberField
        id={id}
        label={label}
        value={value}
        description={schema.description}
        isRequired={required}
        isDisabled={disabled || readonly}
        minValue={schema.minimum || schema.exclusiveMinimum}
        maxValue={schema.maximum || schema.exclusiveMaximum}
        step={type === "integer" ? 1 : 0.1}
        formatOptions={type === "integer" ? { maximumFractionDigits: 0 } : {}}
        validationState={rawErrors?.length ? "invalid" : "valid"}
        errorMessage={rawErrors?.[0]}
        onChange={onChange}
        width={"100%"}
      />
    );
  }

  return (
    <TextField
      id={id}
      label={label}
      description={schema.description}
      isRequired={required}
      isDisabled={disabled || readonly}
      value={value ?? ""}
      placeholder={placeholder}
      validationState={rawErrors?.length ? "invalid" : "valid"}
      errorMessage={rawErrors?.[0]}
      onChange={onChange}
      onBlur={() => onBlur?.(id, value)}
      onFocus={() => onFocus?.(id, value)}
      width={"100%"}
    />
  );
}

export function SpectrumCheckboxWidget(props: WidgetProps) {
  const { id, label, value, disabled, readonly, schema, onChange } = props;

  return (
    <Checkbox
      id={id}
      isSelected={!!value}
      isDisabled={disabled || readonly}
      onChange={onChange}
      width={"100%"}
    >
      {label}
      {schema.description}
    </Checkbox>
  );
}

export function SpectrumCheckboxesWidget(props: WidgetProps) {
  const {
    id,
    options,
    value = [],
    disabled,
    readonly,
    onChange,
    label,
    schema,
  } = props;

  return (
    <CheckboxGroup
      id={id}
      label={label}
      description={schema.description}
      value={value}
      isDisabled={disabled || readonly}
      onChange={onChange}
      width={"100%"}
    >
      {(options.enumOptions ?? []).map((opt) => (
        <Checkbox key={opt.value} value={opt.value}>
          {opt.label}
        </Checkbox>
      ))}
    </CheckboxGroup>
  );
}

export function SpectrumSelectWidget(props: WidgetProps) {
  const {
    id,
    label,
    options,
    value,
    required,
    disabled,
    readonly,
    onChange,
    rawErrors,
    schema,
  } = props;

  const isInvalid = !!rawErrors?.length;

  return (
    <ComboBox
      id={id}
      label={label}
      description={schema.description}
      selectedKey={value}
      isRequired={required}
      isDisabled={disabled || readonly}
      validationState={isInvalid ? "invalid" : "valid"}
      errorMessage={rawErrors?.[0]}
      onSelectionChange={onChange}
      width={"100%"}
    >
      {(options.enumOptions ?? []).map((opt) => (
        <Item key={opt.value}>{opt.label}</Item>
      ))}
    </ComboBox>
  );
}

export function SpectrumRadioWidget(props: WidgetProps) {
  const {
    id,
    label,
    options,
    value,
    required,
    disabled,
    readonly,
    schema,
    onChange,
  } = props;

  return (
    <RadioGroup
      id={id}
      label={label}
      description={schema.description}
      value={value}
      isRequired={required}
      isDisabled={disabled || readonly}
      onChange={onChange}
      width={"100%"}
    >
      {(options.enumOptions ?? []).map((opt) => (
        <Radio key={opt.value} value={opt.value}>
          {opt.label}
        </Radio>
      ))}
    </RadioGroup>
  );
}

export function SpectrumTextareaWidget(props: WidgetProps) {
  const {
    id,
    label,
    value,
    required,
    disabled,
    readonly,
    placeholder,
    rawErrors,
    schema,
    onChange,
  } = props;

  const isInvalid = !!rawErrors?.length;

  return (
    <TextArea
      id={id}
      label={label}
      description={schema.description}
      value={value ?? ""}
      placeholder={placeholder}
      isRequired={required}
      isDisabled={disabled || readonly}
      validationState={isInvalid ? "invalid" : "valid"}
      errorMessage={rawErrors?.[0]}
      onChange={onChange}
      width={"100%"}
    />
  );
}

export function SpectrumDatetimeWidget(
  props: WidgetProps,
  time: boolean = true,
) {
  const {
    id,
    label,
    value,
    disabled,
    readonly,
    required,
    rawErrors,
    schema,
    onChange,
  } = props;

  return (
    <DatePicker
      id={id}
      label={label}
      description={schema.description}
      value={value ?? null}
      isRequired={required}
      granularity={time ? "minute" : "day"}
      isDisabled={disabled || readonly}
      validationState={rawErrors && rawErrors.length > 0 ? "invalid" : "valid"}
      errorMessage={rawErrors?.[0]}
      onChange={onChange}
      width={"100%"}
    />
  );
}

export function SpectrumDateWidget(props: WidgetProps) {
  return SpectrumDatetimeWidget(props, false);
}

export function SpectrumFileWidget(props: WidgetProps) {
  const { id, value, disabled, readonly, onChange } = props;

  return (
    <FileTrigger onSelect={(files) => onChange(files)}>
      <Button id={id} variant="primary" isDisabled={disabled || readonly}>
        Choose file
      </Button>
      {value && <Text>{value.name}</Text>}
    </FileTrigger>
  );
}

export function SpectrumRangeWidget(props: WidgetProps) {
  const { id, label, value, disabled, readonly, schema, onChange } = props;

  return (
    <Slider
      id={id}
      label={label}
      value={value ?? schema.minimum}
      minValue={schema.minimum}
      maxValue={schema.maximum}
      step={schema.multipleOf ?? 1}
      isDisabled={disabled || readonly}
      onChange={onChange}
      contextualHelp={schema.description}
      width={"100%"}
    />
  );
}

export function SpectrumFieldTemplate(props: FieldTemplateProps) {
  const { children, hidden } = props;
  if (hidden) return null;

  return <View marginBottom="size-100">{children}</View>;
}

export function SpectrumErrorTemplate(props: ErrorListProps) {
  const errors: RJSFValidationError[] = props.errors;
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (errors.length) {
      alertRef.current?.focus();
    }
  }, [errors]);

  if (!errors.length) return;

  return (
    <div ref={alertRef} tabIndex={-1}>
      <InlineAlert variant="negative" marginTop="size-200" width={"100%"}>
        <Heading>There are problems with your submission:</Heading>
        <Content marginX="size-400">
          {errors.map((error, i) => (
            <li key={i}> {error.stack} </li>
          ))}
        </Content>
      </InlineAlert>
    </div>
  );
}

export function NoLabelTemplate() {
  return null;
}

export function TitleTemplate({ title }: TitleFieldProps) {
  return (
    <View marginTop="size=200" marginBottom="size-200">
      <Heading>{title}</Heading>
    </View>
  );
}

const SpectrumArrayFieldTemplate = ({
  title,
  items,
  schema,
}: ArrayFieldTemplateProps) => {
  return (
    <View
      marginTop="size-200"
      padding="size-250"
      borderWidth="thin"
      borderColor="dark"
      borderRadius="medium"
      backgroundColor="gray-50"
    >
      <Heading level={2} marginBottom="size-200">
        {" "}
        {title}{" "}
      </Heading>
      {items.map((item) => item)}
      {schema.description && (
        <Text>
          {" "}
          <em>{schema.description}</em>{" "}
        </Text>
      )}
    </View>
  );
};

const SpectrumArrayFieldItemTemplate = ({
  children,
}: ArrayFieldItemTemplateProps) => {
  return <View marginX={"size-400"}>{children}</View>;
};

type ModelFormProps = {
  schema: RJSFSchema;
  onSubmit: (data: Record<string, unknown>) => void;
  // To operate the RJSF form in 'controlled' mode, where the data can be persisted
  // outside of form closure, specify the parameters below. Leave blank for 'uncontrolled' mode.
  formData?: Record<string, unknown>;
  setFormData?: (formData: Record<string, unknown>) => void;
};
const ModelForm = forwardRef<Form, ModelFormProps>(
  ({ schema, onSubmit, formData, setFormData }, ref) => {
    const registry = getDefaultRegistry();
    const widgets = {
      ...registry.widgets,
      TextWidget: SpectrumBaseWidget,
      CheckboxWidget: SpectrumCheckboxWidget,
      CheckboxesWidget: SpectrumCheckboxesWidget,
      // ColorWidget
      DateWidget: SpectrumDateWidget,
      DateTimeWidget: SpectrumDatetimeWidget,
      EmailWidget: SpectrumBaseWidget,
      FileWidget: SpectrumFileWidget,
      // HiddenWidget
      // PasswordWidget
      RadioWidget: SpectrumRadioWidget,
      RangeWidget: SpectrumRangeWidget,
      // RatingWidget
      SelectWidget: SpectrumSelectWidget,
      TextareaWidget: SpectrumTextareaWidget,
      TimeWidget: SpectrumDatetimeWidget,
      URLWidget: SpectrumBaseWidget,
      UpDownWidget: SpectrumBaseWidget,
    };
    const isControlled = formData !== undefined && setFormData !== undefined;

    return (
      <div>
        <Provider theme={defaultTheme}>
          <View
            marginTop="size-200"
            padding="size-250"
            borderWidth="thin"
            borderColor="dark"
            borderRadius="medium"
            backgroundColor="gray-75"
          >
            <Heading level={1}>
              {" "}
              <strong>Model Parameters</strong>{" "}
            </Heading>
            <Form
              ref={ref}
              schema={schema}
              validator={validator}
              widgets={widgets}
              onSubmit={(e: IChangeEvent<Record<string, unknown>>) => {
                onSubmit(e.formData ?? {});
              }}
              uiSchema={{
                "ui:options": {
                  label: false,
                },
              }}
              templates={{
                FieldTemplate: SpectrumFieldTemplate,
                Label: NoLabelTemplate,
                TitleFieldTemplate: TitleTemplate,
                ArrayFieldTemplate: SpectrumArrayFieldTemplate,
                ArrayFieldItemTemplate: SpectrumArrayFieldItemTemplate,
                ButtonTemplates: { SubmitButton: () => null },
                ErrorListTemplate: SpectrumErrorTemplate,
              }}
              {...(isControlled && {
                formData: formData,
                onChange: (data) =>
                  data.formData ? setFormData(data.formData) : null,
              })}
            />
          </View>
        </Provider>
      </div>
    );
  },
);

export default ModelForm;
