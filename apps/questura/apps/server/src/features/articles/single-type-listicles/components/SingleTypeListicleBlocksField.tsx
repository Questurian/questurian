'use client'

import { type ComponentProps } from 'react'
import { BlocksField } from '@payloadcms/ui'
import { useBlockFiltering } from '../hooks/useBlockFiltering'

type SingleTypeListicleBlocksFieldProps = ComponentProps<typeof BlocksField>

const SingleTypeListicleBlocksFieldComponent = (props: SingleTypeListicleBlocksFieldProps) => {
  const { listicleType, modifiedField } = useBlockFiltering(props.field)

  return (
    <BlocksField key={listicleType} {...props} field={modifiedField(props.field)} />
  )
}

export const SingleTypeListicleBlocksField = SingleTypeListicleBlocksFieldComponent
export default SingleTypeListicleBlocksFieldComponent
