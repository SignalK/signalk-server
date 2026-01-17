import { useState, useActionState, ChangeEvent } from 'react'
import {
  Container,
  Row,
  Col,
  Card,
  CardBody,
  CardFooter,
  Button,
  Form,
  Input,
  InputGroup,
  InputGroupText
} from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSpinner } from '@fortawesome/free-solid-svg-icons/faSpinner'
import { faLock } from '@fortawesome/free-solid-svg-icons/faLock'

interface FormFields {
  email: string
  password: string
  confirmPassword: string
}

interface RegisterState {
  error: string | null
  success: boolean
}

export default function Register() {
  const [fields, setFields] = useState<FormFields>({
    email: '',
    password: '',
    confirmPassword: ''
  })

  const [validationError, setValidationError] = useState<string | null>(null)

  const [submitState, submitAction, isSubmitting] = useActionState<
    RegisterState,
    FormData
  >(
    async (_prevState) => {
      if (fields.email.length === 0) {
        return { error: 'Please enter an email address', success: false }
      }
      if (fields.password.length === 0 && fields.confirmPassword.length === 0) {
        return {
          error: 'Please enter and confirm your password',
          success: false
        }
      }
      if (fields.password !== fields.confirmPassword) {
        return { error: 'Passwords do not match', success: false }
      }

      const payload = {
        userId: fields.email,
        password: fields.password
      }

      try {
        const response = await fetch(`/signalk/v1/access/requests`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload),
          credentials: 'include'
        })

        if (response.status !== 202) {
          const json = await response.json()
          return {
            error: json.message ? json.message : json.result,
            success: false
          }
        }

        return { error: null, success: true }
      } catch {
        return { error: 'Network error. Please try again.', success: false }
      }
    },
    { error: null, success: false }
  )

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target

    setFields((prev) => {
      const newFields = { ...prev, [name]: value }

      if (name === 'password' || name === 'confirmPassword') {
        if (
          newFields.password &&
          newFields.confirmPassword &&
          newFields.password !== newFields.confirmPassword
        ) {
          setValidationError('Passwords do not match')
        } else {
          setValidationError(null)
        }
      }

      return newFields
    })
  }

  const displayError = validationError || submitState.error

  return (
    <div>
      <Container>
        <Row className="justify-content-center">
          <Col md="6">
            <Card className="mx-4">
              <CardBody className="p-4">
                <h1>Register</h1>
                {submitState.success && (
                  <p className="text-muted">Your registration has been sent</p>
                )}
                {!submitState.success && (
                  <Form id="register-form" action={submitAction}>
                    <p className="text-muted">Create your account</p>
                    <InputGroup className="mb-3">
                      <InputGroupText>@</InputGroupText>
                      <Input
                        name="email"
                        type="text"
                        placeholder="Email"
                        value={fields.email}
                        onChange={handleInputChange}
                      />
                    </InputGroup>
                    <InputGroup className="mb-3">
                      <InputGroupText>
                        <FontAwesomeIcon icon={faLock} />
                      </InputGroupText>
                      <Input
                        name="password"
                        type="password"
                        placeholder="Password"
                        value={fields.password}
                        onChange={handleInputChange}
                      />
                    </InputGroup>
                    <InputGroup className="mb-0">
                      <InputGroupText>
                        <FontAwesomeIcon icon={faLock} />
                      </InputGroupText>
                      <Input
                        name="confirmPassword"
                        type="password"
                        placeholder="Repeat password"
                        value={fields.confirmPassword}
                        onChange={handleInputChange}
                      />
                    </InputGroup>
                    {displayError && (
                      <p className="text-danger mt-3 mb-0">{displayError}</p>
                    )}
                  </Form>
                )}
              </CardBody>
              {!submitState.success && (
                <CardFooter className="p-4">
                  <Row>
                    <Col xs="12" sm="12">
                      <Button
                        type="submit"
                        form="register-form"
                        color="success"
                        block
                        disabled={isSubmitting || !!validationError}
                      >
                        {isSubmitting ? (
                          <>
                            <FontAwesomeIcon icon={faSpinner} spin />{' '}
                            Creating...
                          </>
                        ) : (
                          'Create Account'
                        )}
                      </Button>
                    </Col>
                  </Row>
                </CardFooter>
              )}
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  )
}
