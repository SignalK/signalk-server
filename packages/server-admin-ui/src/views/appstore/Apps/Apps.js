import React, { Component } from 'react'
import { connect } from 'react-redux'
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  Form,
  FormGroup,
  Col,
  Input,
  Label,
} from 'reactstrap'
import ThisSession from './ThisSession'
import AppsList from './AppsList'

const viewParams = {
  apps: {
    listName: 'available',
    title: 'Available Apps',
    defaultCategory: 'New/Updated',
  },
  installed: {
    listName: 'installed',
    title: 'Installed Apps',
    defaultCategory: 'All',
  },
  updates: {
    listName: 'updates',
    title: 'Available Updates',
    defaultCategory: 'All',
  },
}

class AppTable extends Component {
  constructor(props) {
    super(props)

    const viewData = viewParams[this.props.match.params.view]

    let categorized = this.categorize(viewData.defaultCategory)

    this.state = {
      category: viewData.defaultCategory,
      categorized: categorized,
      search: '',
    }

    this.handleCategoryChange = this.handleCategoryChange.bind(this)
    this.handleSearch = this.handleSearch.bind(this)
  }

  categorize(category) {
    const viewData = viewParams[this.props.match.params.view]
    const apps = this.props.appStore[viewData.listName]
    return category === 'All'
      ? apps
      : apps.filter((app) => app.categories.indexOf(category) !== -1)
  }

  componentDidUpdate() {
    if (!this.state.categorized || !this.state.categorized.length) {
      const categorized = this.categorize(this.state.category)
      if (categorized && categorized.length) {
        this.setState({ categorized })
      }
    }
  }

  handleCategoryChange(event) {
    let searchResults
    let categorized = this.categorize(event.target.value)

    if (this.state.search.length > 0) {
      searchResults = this.searchApps(categorized, this.state.search)
    }

    this.setState({
      category: event.target.value,
      categorized,
      searchResults,
    })
  }

  searchApps(apps, searchString) {
    const lowerCase = searchString.toLowerCase()
    return apps.filter((app) => {
      return (
        app.keywords.filter((k) => k.toLowerCase().includes(lowerCase))
          .length ||
        app.name.toLowerCase().includes(lowerCase) ||
        (app.description &&
          app.description.toLowerCase().includes(lowerCase)) ||
        (app.author && app.author.toLowerCase().includes(lowerCase))
      )
    })
  }

  handleSearch(event) {
    let searchResults = null
    const search = event.target.value
    if (search.length !== 0) {
      searchResults = this.searchApps(this.state.categorized, search)
    }

    this.setState({ search, searchResults })
  }

  render() {
    const viewData = viewParams[this.props.match.params.view]
    return (
      <div className="animated fadeIn">
        <ThisSession installingApps={this.props.appStore.installing} />
        {!this.props.appStore.storeAvailable && (
          <Card className="border-warning">
            <CardHeader>Appstore not available</CardHeader>
            <CardBody>
              You probably don't have Internet connectivity and Appstore can not
              be reached.
            </CardBody>
          </Card>
        )}
        {this.props.appStore.storeAvailable && (
          <Card>
            <CardHeader>
              <i className="fa fa-align-justify" /> {viewData.title}
            </CardHeader>
            <CardBody>
              <Form
                action=""
                method="post"
                encType="multipart/form-data"
                className="form-horizontal"
                onSubmit={(e) => {
                  e.preventDefault()
                }}
              >
                <FormGroup row>
                  <Col xs="12" md="3">
                    <Input
                      type="select"
                      value={this.state.category}
                      name="context"
                      onChange={this.handleCategoryChange}
                    >
                      {this.props.appStore.categories.map((key) => {
                        return (
                          <option disabled={key == '---'} key={key} value={key}>
                            {key}
                          </option>
                        )
                      })}
                    </Input>
                  </Col>
                  <Col xs="3" md="1" className={'col-form-label'}>
                    <Label htmlFor="select">Search</Label>
                  </Col>
                  <Col xs="12" md="4">
                    <Input
                      type="text"
                      name="search"
                      onChange={this.handleSearch}
                      value={this.state.search}
                    />
                  </Col>
                </FormGroup>
              </Form>
              <AppsList
                apps={this.state.searchResults || this.state.categorized}
                storeAvailable={this.props.appStore.storeAvailable}
                listName={viewData.listName}
              />
            </CardBody>
          </Card>
        )}
      </div>
    )
  }
}

const mapStateToProps = ({ appStore }) => ({ appStore })

export default connect(mapStateToProps)(AppTable)
