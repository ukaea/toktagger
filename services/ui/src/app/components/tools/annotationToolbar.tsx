"use client"

import { ToggleButton } from "@adobe/react-spectrum"
import { useAnnotationProvider } from "../providers/annotation-provider"

export const AnnotationToolbar = () => {

    const {toolingInfo, setToolingCallbacks, toolingCallbacks, editMode} = useAnnotationProvider()
    return (
        <div className="flex flex-col w-50 items-center space-y-3">
            <header className="p-6">
                <h1 className="text-4xl font-bold text-center text-gray-900">
                    Annotation Toolbar
                </h1>
            </header>
            {[...toolingInfo.values()].map((info) => (
                <div key={info.id} className="mb-6 text-center w-2/3">
                    <h3 className="mb-2">{info.id}</h3>
                    <hr className="mb-2"/>
                    <div className="flex flex-col items-center space-y-1">
                        {info.categories.map((category) => (
                            <div key={category.name}>
                                <ToggleButton
                                    width="size-1600"
                                    isDisabled={!editMode}
                                    isSelected={info.id === toolingCallbacks?.id && category === toolingCallbacks.category}
                                    onPress={() => {
                                        setToolingCallbacks(info.id, category)
                                    }}
                                >
                                    {category.name}
                                </ToggleButton>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
}