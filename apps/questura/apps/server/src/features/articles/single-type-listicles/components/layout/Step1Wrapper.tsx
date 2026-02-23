'use client'

import { ComponentProps } from 'react'
import { Button } from '@payloadcms/ui'
import { useStep1Workflow } from '../../hooks/useStep1Workflow'
import styles from '../../styles/Step1Wrapper.module.css'

type FieldProps = ComponentProps<any>

const Step1Wrapper = (_: FieldProps) => {
  const {
    isStep1Complete,
    step1_complete,
    in_update_mode,
    validationErrors,
    showConfirmDialog,
    pendingChange,
    handleContinue,
    handleUpdate,
    handleSaveChanges,
    handleConfirmChange,
    handleCancelChange,
    handleCancelUpdate,
  } = useStep1Workflow()

  return (
    <div className={styles.wrapper}>
      {validationErrors.length > 0 && (
        <div className={styles.errorContainer}>
          <h4>Please correct the following:</h4>
          <ul>
            {validationErrors.map((error) => (
              <li key={error.field}>{error.message}</li>
            ))}
          </ul>
        </div>
      )}

      {!step1_complete && (
        <Button onClick={handleContinue} disabled={!isStep1Complete}>
          Continue
        </Button>
      )}

      {step1_complete && !in_update_mode && (
        <Button onClick={handleUpdate} buttonStyle="secondary">
          Update Setup
        </Button>
      )}

      {in_update_mode && (
        <div className={styles.updateButtonGroup}>
          <Button onClick={handleSaveChanges} disabled={!isStep1Complete}>
            Save Changes
          </Button>
          <Button onClick={handleCancelUpdate} buttonStyle="secondary">
            Cancel Update
          </Button>
        </div>
      )}

      {showConfirmDialog && pendingChange && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h3>Clear List Items?</h3>
            <p>
              Changing the {pendingChange.field === 'listicleType' ? 'listicle type' : 'location'}{' '}
              will clear all list items you've added. Continue?
            </p>
            <div className={styles.modalButtons}>
              <Button onClick={handleConfirmChange}>Clear & Continue</Button>
              <Button onClick={handleCancelChange} buttonStyle="secondary">
                Keep Items
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Step1Wrapper
