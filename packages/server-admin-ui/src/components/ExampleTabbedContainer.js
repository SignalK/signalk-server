import React, { Component } from 'react'
import {
  Nav,
  NavItem,
  NavLink,
  TabContent,
  TabPane,
  Card,
  CardBody,
  CardHeader
} from 'reactstrap'
import classnames from 'classnames'

class ExampleTabbedContainer extends Component {
  constructor(props) {
    super(props)
    this.state = {
      activeTab: '1'
    }
    this.toggle = this.toggle.bind(this)
  }

  toggle(tab) {
    if (this.state.activeTab !== tab) {
      this.setState({ activeTab: tab })
    }
  }

  render() {
    return (
      <Card>
        <CardHeader>
          <strong>Example Tabbed Container</strong>
        </CardHeader>
        <CardBody>
          <Nav tabs>
            <NavItem>
              <NavLink
                className={classnames({ active: this.state.activeTab === '1' })}
                onClick={() => {
                  this.toggle('1')
                }}
              >
                Tab 1
              </NavLink>
            </NavItem>
            <NavItem>
              <NavLink
                className={classnames({ active: this.state.activeTab === '2' })}
                onClick={() => {
                  this.toggle('2')
                }}
              >
                Tab 2
              </NavLink>
            </NavItem>
            <NavItem>
              <NavLink
                className={classnames({ active: this.state.activeTab === '3' })}
                onClick={() => {
                  this.toggle('3')
                }}
              >
                Tab 3
              </NavLink>
            </NavItem>
          </Nav>
          <TabContent activeTab={this.state.activeTab}>
            <TabPane tabId="1">
              <p>Content for Tab 1</p>
            </TabPane>
            <TabPane tabId="2">
              <p>Content for Tab 2</p>
            </TabPane>
            <TabPane tabId="3">
              <p>Content for Tab 3</p>
            </TabPane>
          </TabContent>
        </CardBody>
      </Card>
    )
  }
}

export default ExampleTabbedContainer
